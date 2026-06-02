import type { Run } from "@cursor/sdk";
import type {
  LiveActivityEvent,
  LiveCurrentSlot,
  LiveMazeState,
  WorldStatusSnapshot,
} from "./types.js";

const MAX_ACTIVITY = 40;
const MAX_TEXT = 300;

export type StreamSummary = {
  chars: number;
  mcpToolCalls: number;
  toolNames: string[];
  activityCount: number;
  lastProblemId?: string;
  lastSuccessfulSubmit?: { problemId: string; at: string };
  maze?: LiveMazeState;
};

function truncate(text: string, max = MAX_TEXT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function previewJson(value: unknown): string {
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(String(value));
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function parseMcpCall(args: unknown): {
  server?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
} {
  const record = asRecord(args);
  if (!record) return {};

  const input = asRecord(record.input) ?? record;
  const nested = asRecord(input.arguments ?? input.args ?? record.arguments ?? record.args);
  const server =
    typeof input.server === "string"
      ? input.server
      : typeof input.providerIdentifier === "string"
        ? input.providerIdentifier
        : typeof record.providerIdentifier === "string"
          ? record.providerIdentifier
          : undefined;
  const toolName =
    typeof input.toolName === "string"
      ? input.toolName
      : typeof input.tool_name === "string"
        ? input.tool_name
        : typeof record.toolName === "string"
          ? record.toolName
          : undefined;

  return { server, toolName, arguments: nested };
}

function parseToolResult(result: unknown): { text?: string; parsed?: unknown; ok?: boolean } {
  if (result == null) return {};
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      return { text: result, parsed, ok: inferOk(parsed) };
    } catch {
      return { text: result };
    }
  }
  const record = asRecord(result);
  if (!record) return { text: String(result) };

  const content = record.content;
  if (Array.isArray(content)) {
    const text = content
      .map((block) => {
        const b = asRecord(block);
        return typeof b?.text === "string" ? b.text : "";
      })
      .filter(Boolean)
      .join("\n");
    if (text) {
      try {
        const parsed = JSON.parse(text);
        return { text, parsed, ok: inferOk(parsed) };
      } catch {
        return { text, ok: record.isError === false };
      }
    }
  }

  return { parsed: result, ok: inferOk(result) };
}

function inferOk(value: unknown): boolean | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (typeof record.ok === "boolean") return record.ok;
  if (record.isError === true) return false;
  if (typeof record.error === "string") return false;
  return undefined;
}

function extractPosition(parsed: unknown): { x: number; y: number; atExit?: boolean } | undefined {
  const record = asRecord(parsed);
  if (!record) return undefined;
  const pos = asRecord(record.position);
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") return undefined;
  return {
    x: pos.x,
    y: pos.y,
    atExit: typeof record.atExit === "boolean" ? record.atExit : undefined,
  };
}

export class LiveSlotTracker {
  readonly activity: LiveActivityEvent[] = [];
  maze?: LiveMazeState;
  private lastAssistant = "";
  private chars = 0;
  private mcpToolCalls = 0;
  private toolNames: string[] = [];
  private lastProblemId?: string;
  private lastSuccessfulSubmit?: { problemId: string; at: string };

  push(event: LiveActivityEvent): void {
    this.activity.push(event);
    if (this.activity.length > MAX_ACTIVITY) {
      this.activity.splice(0, this.activity.length - MAX_ACTIVITY);
    }
  }

  snapshot(): LiveCurrentSlot["activity"] {
    return [...this.activity];
  }

  mergeWorldMazes(status: WorldStatusSnapshot): void {
    if (!status.mazes) return;
    for (const [problemId, mazeStatus] of Object.entries(status.mazes)) {
      if (!this.maze || this.maze.problemId === problemId) {
        this.maze = {
          problemId,
          path: this.maze?.problemId === problemId ? this.maze.path : "",
          position: mazeStatus.position,
          atExit: mazeStatus.atExit,
          lastSubmit: this.maze?.problemId === problemId ? this.maze.lastSubmit : undefined,
        };
        this.lastProblemId = problemId;
      }
    }
  }

  handleAssistant(text: string): void {
    this.chars += text.length;
    const delta = text.startsWith(this.lastAssistant)
      ? text.slice(this.lastAssistant.length)
      : text;
    this.lastAssistant = text;
    if (!delta.trim()) return;

    const last = this.activity[this.activity.length - 1];
    if (last?.kind === "assistant") {
      last.detail = truncate(`${last.detail ?? ""}${delta}`);
      last.at = new Date().toISOString();
      return;
    }

    this.push({
      at: new Date().toISOString(),
      kind: "assistant",
      label: "Assistant",
      detail: truncate(delta.trim()),
    });
  }

  handleThinking(text: string): void {
    if (!text.trim()) return;
    const last = this.activity[this.activity.length - 1];
    if (last?.kind === "thinking") {
      last.detail = truncate(`${last.detail ?? ""}${text}`);
      last.at = new Date().toISOString();
      return;
    }
    this.push({
      at: new Date().toISOString(),
      kind: "thinking",
      label: "Thinking",
      detail: truncate(text.trim()),
    });
  }

  handleWorldToolInvoke(
    toolName: string,
    toolArgs: Record<string, unknown> | undefined,
  ): void {
    const problemId =
      typeof toolArgs?.problemId === "string" ? toolArgs.problemId : undefined;
    if (problemId) this.lastProblemId = problemId;

    let label = toolName;
    if (problemId) label = `${toolName} · ${problemId}`;
    if (toolName === "move" && typeof toolArgs?.direction === "string") {
      label = `move ${toolArgs.direction} · ${problemId ?? "?"}`;
    }
    if (toolName === "submit") {
      const answer = typeof toolArgs?.answer === "string" ? toolArgs.answer : "";
      label = `submit · ${problemId ?? "?"}`;
      this.push({
        at: new Date().toISOString(),
        kind: "world",
        label,
        detail: answer ? truncate(answer) : undefined,
      });
      this.updateMazeFromWorldTool(toolName, toolArgs, undefined, undefined);
      return;
    }

    this.push({
      at: new Date().toISOString(),
      kind: "world",
      label,
      detail: toolArgs ? previewJson(toolArgs) : undefined,
    });
    this.updateMazeFromWorldTool(toolName, toolArgs, undefined, undefined);
  }

  handleToolCall(name: string, status: string, args?: unknown, result?: unknown): void {
    if (status !== "completed" && status !== "error") return;

    this.mcpToolCalls += 1;
    this.toolNames.push(name);

    const mcp = parseMcpCall(args);
    const isWorldMcp =
      mcp.server === "world" &&
      mcp.toolName &&
      (name === "mcp" || name === "CallMcpTool" || /mcp/i.test(name));
    if (isWorldMcp) {
      this.handleWorldTool(mcp.toolName!, mcp.arguments, result, status === "error");
      return;
    }

    if (name === "GetMcpTools") {
      return;
    }

    const ok = status === "completed" ? true : status === "error" ? false : undefined;
    this.push({
      at: new Date().toISOString(),
      kind: "tool",
      label: name,
      detail: previewJson(args),
      ok,
    });
  }

  private handleWorldTool(
    toolName: string,
    toolArgs: Record<string, unknown> | undefined,
    result: unknown,
    errored: boolean,
  ): void {
    const problemId =
      typeof toolArgs?.problemId === "string" ? toolArgs.problemId : undefined;
    if (problemId) this.lastProblemId = problemId;

    const parsed = parseToolResult(result);
    const ok = errored ? false : (parsed.ok ?? !errored);

    const lastWorld = [...this.activity].reverse().find((e) => e.kind === "world");
    if (lastWorld && lastWorld.label.startsWith(toolName)) {
      lastWorld.ok = ok;
      if (parsed.text) lastWorld.detail = truncate(parsed.text);
    } else {
      let label = toolName;
      if (problemId) label = `${toolName} · ${problemId}`;
      this.push({
        at: new Date().toISOString(),
        kind: "world",
        label,
        detail: parsed.text ? truncate(parsed.text) : previewJson(toolArgs),
        ok,
      });
    }

    this.updateMazeFromWorldTool(toolName, toolArgs, parsed.parsed, ok);
  }

  private updateMazeFromWorldTool(
    toolName: string,
    toolArgs: Record<string, unknown> | undefined,
    parsed: unknown,
    ok?: boolean,
  ): void {
    const problemId =
      typeof toolArgs?.problemId === "string" ? toolArgs.problemId : undefined;
    if (!problemId) return;

    if (!this.maze || this.maze.problemId !== problemId) {
      this.maze = { problemId, path: "" };
    }

    if (toolName === "move") {
      const direction =
        typeof toolArgs?.direction === "string" ? toolArgs.direction.toUpperCase() : "";
      if (direction && ok !== false) {
        this.maze.path = `${this.maze.path}${direction.replace(/[^NSEWUDRL]/g, "")}`;
      }
      if (ok) {
        const pos = extractPosition(parsed);
        if (pos) {
          this.maze.position = { x: pos.x, y: pos.y };
          if (pos.atExit !== undefined) this.maze.atExit = pos.atExit;
        }
      }
    }

    if (toolName === "maze_status") {
      const pos = extractPosition(parsed);
      if (pos) {
        this.maze.position = { x: pos.x, y: pos.y };
        if (pos.atExit !== undefined) this.maze.atExit = pos.atExit;
      }
    }

    if (toolName === "get_problem") {
      this.maze.problemId = problemId;
    }

    if (toolName === "submit") {
      const answer = typeof toolArgs?.answer === "string" ? toolArgs.answer : "";
      if (answer) {
        this.maze.path = answer.toUpperCase().replace(/[^NSEWUDRL]/g, "");
      }
      this.maze.lastSubmit = { answer, ok };
      if (ok && problemId) {
        this.lastSuccessfulSubmit = { problemId, at: new Date().toISOString() };
      }
      if (ok && this.maze.atExit === undefined) {
        this.maze.atExit = ok;
      }
    }
  }

  summary(): StreamSummary {
    return {
      chars: this.chars,
      mcpToolCalls: this.mcpToolCalls,
      toolNames: [...this.toolNames],
      activityCount: this.activity.length,
      lastProblemId: this.lastProblemId,
      lastSuccessfulSubmit: this.lastSuccessfulSubmit
        ? { ...this.lastSuccessfulSubmit }
        : undefined,
      maze: this.maze ? { ...this.maze } : undefined,
    };
  }
}

export async function consumeRunStreamWithLive(
  run: Run,
  tracker: LiveSlotTracker,
  onActivity?: () => void,
): Promise<StreamSummary> {
  const pendingToolUses = new Map<string, { name: string; input: unknown }>();

  try {
    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        const text = event.message.content
          .filter((block): block is { type: "text"; text: string } => block.type === "text")
          .map((block) => block.text)
          .join("");
        for (const block of event.message.content) {
          if (block.type === "tool_use") {
            pendingToolUses.set(block.id, { name: block.name, input: block.input });
            if (block.name === "CallMcpTool") {
              const mcp = parseMcpCall(block.input);
              if (mcp.server === "world" && mcp.toolName && mcp.toolName !== "mcp_auth") {
                tracker.handleWorldToolInvoke(mcp.toolName, mcp.arguments);
                onActivity?.();
              }
            }
          }
        }
        if (text) {
          tracker.handleAssistant(text);
          onActivity?.();
        }
      }
      if (event.type === "thinking" && event.text) {
        tracker.handleThinking(event.text);
        onActivity?.();
      }
      if (event.type === "tool_call") {
        const pending = pendingToolUses.get(event.call_id);
        const args = event.args ?? pending?.input;
        const name =
          event.name === "mcp" && pending?.name ? pending.name : event.name;
        tracker.handleToolCall(name, event.status, args, event.result);
        if (event.status === "completed" || event.status === "error") {
          pendingToolUses.delete(event.call_id);
          onActivity?.();
        }
      }
    }
  } catch {
    // stream may abort on cancel
  }
  return tracker.summary();
}
