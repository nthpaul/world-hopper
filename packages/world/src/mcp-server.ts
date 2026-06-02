import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadTaskPack, resolveWorldPath } from "./task-loader.js";
import type { LoadedTaskPack } from "./task-loader.js";
import type { WorldStatus } from "./types.js";
import { runVerifier } from "./verifiers.js";
import { debugLog } from "./debug-log.js";
import { parseMaze, tryMove, type MazeGrid, type MazePosition } from "./maze.js";

const execFileAsync = promisify(execFile);

export type WorldRuntime = {
  worldId: string;
  pack: LoadedTaskPack;
  solved: Set<string>;
  mazeGrids: Map<string, MazeGrid>;
  mazePositions: Map<string, MazePosition>;
  mazeAtExit: Map<string, boolean>;
  status(): WorldStatus;
};

function loadMazeForProblem(runtime: WorldRuntime, problemId: string): MazeGrid {
  const problem = runtime.pack.problems.get(problemId);
  if (!problem?.mazeLayout) {
    throw new Error(`problem ${problemId} has no maze layout`);
  }
  if (!runtime.mazeGrids.has(problemId)) {
    const layoutPath = resolveWorldPath(runtime.pack.worldRoot, problem.mazeLayout);
    const grid = parseMaze(readFileSync(layoutPath, "utf8"));
    runtime.mazeGrids.set(problemId, grid);
    runtime.mazePositions.set(problemId, { ...grid.start });
    runtime.mazeAtExit.set(problemId, false);
  }
  return runtime.mazeGrids.get(problemId)!;
}

export function createWorldRuntime(taskPackPath: string, worldId: string, worldRoot: string): WorldRuntime {
  const pack = loadTaskPack(taskPackPath, worldRoot);
  const solved = new Set<string>();
  const mazeGrids = new Map<string, MazeGrid>();
  const mazePositions = new Map<string, MazePosition>();
  const mazeAtExit = new Map<string, boolean>();

  return {
    worldId,
    pack,
    solved,
    mazeGrids,
    mazePositions,
    mazeAtExit,
    status(): WorldStatus {
      const mazes: WorldStatus["mazes"] = {};
      for (const [problemId, pos] of mazePositions) {
        mazes[problemId] = {
          position: { x: pos.x, y: pos.y },
          atExit: mazeAtExit.get(problemId) === true,
        };
      }
      return {
        worldId,
        packId: pack.manifest.packId,
        solvedCount: solved.size,
        total: pack.manifest.problems.length,
        solvedIds: [...solved],
        ...(Object.keys(mazes).length > 0 ? { mazes } : {}),
      };
    },
  };
}

export function createMcpServer(runtime: WorldRuntime): McpServer {
  const server = new McpServer({
    name: `world-${runtime.worldId}`,
    version: "0.1.0",
  });

  server.registerTool(
    "list_problems",
    {
      description: "List all problems in this world with solved status",
      inputSchema: z.object({}),
    },
    async () => {
      debugLog("mcp-server.ts:list_problems", "list_problems invoked", "H4-fix", {
        worldId: runtime.worldId,
        total: runtime.pack.manifest.problems.length,
      });
      const problems = runtime.pack.manifest.problems.map((p) => ({
        id: p.id,
        title: p.title,
        solved: runtime.solved.has(p.id),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(problems, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_problem",
    {
      description: "Get full problem prompt and artifact paths",
      inputSchema: z.object({ problemId: z.string() }),
    },
    async ({ problemId }) => {
      const problem = runtime.pack.problems.get(problemId);
      if (!problem) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "unknown problem" }) }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: problem.id,
                title: problem.title,
                prompt: problem.prompt,
                artifacts: problem.artifacts.map((a) => `/world/${a}`),
                allowShell: problem.allowShell ?? false,
                allowMove: problem.allowMove ?? false,
                mazeLayout: problem.mazeLayout,
                solved: runtime.solved.has(problem.id),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "read_file",
    {
      description: "Read a file under /world",
      inputSchema: z.object({ path: z.string() }),
    },
    async ({ path }) => {
      try {
        const filePath = resolveWorldPath(runtime.pack.worldRoot, path);
        const content = readFileSync(filePath, "utf8");
        return { content: [{ type: "text", text: content }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "write_file",
    {
      description: "Write a file under /world (for fixing configs, creating .env, etc.)",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
    },
    async ({ path, content }) => {
      try {
        const filePath = resolveWorldPath(runtime.pack.worldRoot, path);
        writeFileSync(filePath, content, "utf8");
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, path }) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  const mazeEnabled = runtime.pack.manifest.features?.includes("maze") ?? false;

  if (mazeEnabled) {
    server.registerTool(
      "move",
      {
        description:
          "Move one step in the maze for a problem (N/S/E/W). Only for problems with allowMove.",
        inputSchema: z.object({
          problemId: z.string(),
          direction: z.string(),
        }),
      },
      async ({ problemId, direction }) => {
        const problem = runtime.pack.problems.get(problemId);
        if (!problem?.allowMove) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "move not allowed for this problem" }) }],
            isError: true,
          };
        }
        try {
          const grid = loadMazeForProblem(runtime, problemId);
          const pos = runtime.mazePositions.get(problemId)!;
          const step = tryMove(grid, pos, direction);
          if (!step.ok) {
            return {
              content: [{ type: "text", text: JSON.stringify({ ok: false, message: step.message, position: pos }) }],
              isError: true,
            };
          }
          runtime.mazePositions.set(problemId, step.pos);
          runtime.mazeAtExit.set(problemId, step.atExit);
          const cell = grid.rows[step.pos.y]![step.pos.x];
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  position: step.pos,
                  cell,
                  atExit: step.atExit,
                }),
              },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: JSON.stringify({ error: message }) }],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "maze_status",
      {
        description: "Current maze position for a problem (after move calls)",
        inputSchema: z.object({ problemId: z.string() }),
      },
      async ({ problemId }) => {
        try {
          const grid = loadMazeForProblem(runtime, problemId);
          const pos = runtime.mazePositions.get(problemId)!;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  position: pos,
                  cell: grid.rows[pos.y]![pos.x],
                  atExit: runtime.mazeAtExit.get(problemId) ?? false,
                  start: grid.start,
                  exit: grid.exit,
                }),
              },
            ],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text", text: JSON.stringify({ error: message }) }],
            isError: true,
          };
        }
      },
    );
  }

  server.registerTool(
    "run_shell",
    {
      description: "Run an allowlisted shell command under /world (only when problem allows shell)",
      inputSchema: z.object({
        problemId: z.string(),
        command: z.string(),
      }),
    },
    async ({ problemId, command }) => {
      const problem = runtime.pack.problems.get(problemId);
      if (!problem?.allowShell) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "shell not allowed for this problem" }) }],
          isError: true,
        };
      }

      const blocked = ["rm -rf /", "curl ", "wget ", "nc ", "bash -i"];
      if (blocked.some((b) => command.includes(b))) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "command blocked" }) }],
          isError: true,
        };
      }

      try {
        const { stdout, stderr } = await execFileAsync("bash", ["-lc", command], {
          cwd: runtime.pack.worldRoot,
          timeout: 5000,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ stdout, stderr, exitCode: 0 }),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "submit",
    {
      description: "Submit an answer for verification",
      inputSchema: z.object({
        problemId: z.string(),
        answer: z.string().optional(),
      }),
    },
    async ({ problemId, answer }) => {
      debugLog("mcp-server.ts:submit", "submit invoked", "H2,H5", {
        worldId: runtime.worldId,
        problemId,
        answerLen: answer?.length ?? 0,
        answerPreview: answer?.slice(0, 80) ?? null,
      });

      const problem = runtime.pack.problems.get(problemId);
      if (!problem) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "unknown problem" }) }],
          isError: true,
        };
      }
      if (runtime.solved.has(problemId)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, alreadySolved: true }) }],
        };
      }

      const result = await runVerifier(problem.verify, {
        worldRoot: runtime.pack.worldRoot,
        problemId,
        answer,
        mazeAtExit: (id) => runtime.mazeAtExit.get(id) === true,
      });

      if (result.ok) {
        runtime.solved.add(problemId);
      }

      debugLog("mcp-server.ts:submit-result", "submit verified", "H2,H3,H5", {
        worldId: runtime.worldId,
        problemId,
        verifyOk: result.ok,
        message: result.message,
        solvedIds: [...runtime.solved],
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: result.ok, message: result.message, solvedIds: [...runtime.solved] }),
          },
        ],
        isError: !result.ok,
      };
    },
  );

  server.registerTool(
    "world_status",
    {
      description: "Current solve progress in this world",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(runtime.status(), null, 2) }],
    }),
  );

  return server;
}

export async function handleMcpRequest(
  runtime: WorldRuntime,
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const server = createMcpServer(runtime);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
