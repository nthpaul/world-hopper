import type { BenchResults, BenchRunStatus, ProblemMeta } from "./types.js";
import { renderProblemsRunSummary } from "./render-problems.js";
import { renderLiveAttempt } from "./render-live.js";

const WORLD_PALETTE = [
  "#7a6a52",
  "#5c7a6b",
  "#6b5c7a",
  "#7a5c5c",
  "#5c6b7a",
  "#7a735c",
  "#5c7a73",
  "#735c7a",
];

export function worldColor(worldId: string): string {
  const n = Number.parseInt(worldId, 10);
  return WORLD_PALETTE[Number.isFinite(n) ? n % WORLD_PALETTE.length : 0]!;
}

export function fmtNum(n: number): string {
  return `<span class="num">${n}</span>`;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `<span class="num">${ms}</span>ms`;
  const s = (ms / 1000).toFixed(1);
  return `<span class="num">${s}</span>s`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `<span class="num">${d.toLocaleTimeString()}</span>`;
}

function statusLabel(status: BenchRunStatus | undefined): string {
  switch (status) {
    case "starting":
      return "Starting";
    case "running":
      return "Live";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    default:
      return "";
  }
}

export function renderResults(
  data: BenchResults,
  sourceLabel: string,
  problems: ProblemMeta[] = [],
): string {
  const isLive = data.status === "starting" || data.status === "running";
  const endMs =
    isLive ? Date.now() : new Date(data.endedAt || data.updatedAt || data.startedAt).getTime();
  const runMs = endMs - new Date(data.startedAt).getTime();
  const { config, aggregates, slots } = data;
  const statusBadge = data.status
    ? `<span class="status-badge status-${data.status}">${statusLabel(data.status)}</span>`
    : "";

  const timelineBlocks = slots.map(
    (s) =>
      `<div class="timeline-block" style="background:${worldColor(s.worldId)}" title="Slot ${s.slotIndex}: world-${s.worldId}">w<span class="num">${s.worldId}</span></div>`,
  );

  if (data.currentSlot) {
    timelineBlocks.push(
      `<div class="timeline-block timeline-block-live" style="background:${worldColor(data.currentSlot.worldId)}" title="Slot ${data.currentSlot.slotIndex} in progress">w<span class="num">${data.currentSlot.worldId}</span></div>`,
    );
  }

  const timeline = timelineBlocks.join("");

  const worldIds = new Set([
    ...Object.keys(aggregates.perWorldVisitCount ?? {}),
    ...Object.keys(aggregates.uniqueSolvedByWorld ?? {}),
  ]);
  for (let i = 0; i < config.worldCount; i++) worldIds.add(String(i));

  const worldGrid = [...worldIds]
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => {
      const visits = aggregates.perWorldVisitCount?.[id] ?? 0;
      const solved = aggregates.uniqueSolvedByWorld?.[id] ?? [];
      const solvedLabels = solved.map((pid) => {
        const prob = problems.find((p) => p.id === pid);
        return prob ? `${prob.title} (${pid})` : pid;
      });
      const assigned = config.worldAssignments?.[id];
      const assignedLabel = assigned
        ? (() => {
            const prob = problems.find((p) => p.id === assigned);
            return prob ? `${prob.title} (${assigned})` : assigned;
          })()
        : "";
      const isActive = data.currentSlot?.worldId === id;
      return `<div class="world-cell${isActive ? " world-cell-active" : ""}">
        <div class="world-cell-id">world-<span class="num">${id}</span></div>
        <div class="world-cell-assigned">${assignedLabel || "—"}</div>
        <div class="world-cell-visits num">${visits} visit${visits === 1 ? "" : "s"}</div>
        <div class="world-cell-solved">${solvedLabels.length ? solvedLabels.join("; ") : "—"}</div>
      </div>`;
    })
    .join("");

  const slotRows = slots
    .map((s) => {
      const deltaClass = s.solvedDelta > 0 ? "delta-pos" : "delta-zero";
      const statusClass =
        s.runStatus === "cancelled" ? "status-cancelled" : "status-finished";
      const durMs = s.solveDurationMs ?? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
      const durSec = (durMs / 1000).toFixed(1);
      const durationClass = s.exitReason === "solved" ? "slot-duration-solved" : "";
      const exitLabel = s.exitReason === "solved" ? "solved" : s.exitReason === "timeout" ? "timeout" : "—";
      return `<tr>
        <td class="num">${s.slotIndex}</td>
        <td>world-<span class="num">${s.worldId}</span></td>
        <td class="${durationClass}"><span class="num">${durSec}</span>s</td>
        <td>${exitLabel}</td>
        <td class="${deltaClass} num">${s.solvedDelta}</td>
        <td class="num">${s.mcpToolCalls ?? "—"}</td>
        <td class="num">${s.assistantChars ?? "—"}</td>
        <td class="${statusClass}">${s.runStatus ?? "—"}</td>
      </tr>`;
    })
    .join("");

  const solvedSlots = slots.filter((s) => s.exitReason === "solved");
  const avgSolveMs =
    solvedSlots.length > 0
      ? solvedSlots.reduce(
          (sum, s) =>
            sum + (s.solveDurationMs ?? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()),
          0,
        ) / solvedSlots.length
      : null;

  const problemsHtml = renderProblemsRunSummary(
    problems,
    aggregates.uniqueSolvedByWorld ?? {},
  );

  const assignmentRows = config.worldAssignments
    ? Object.entries(config.worldAssignments)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([worldId, problemId]) => {
          const prob = problems.find((p) => p.id === problemId);
          const label = prob ? `${prob.title} (<code>${problemId}</code>)` : `<code>${problemId}</code>`;
          return `<tr><td>world-<span class="num">${worldId}</span></td><td>${label}</td></tr>`;
        })
        .join("")
    : "";

  const assignmentsHtml = assignmentRows
    ? `<section>
      <h2>World → task assignments</h2>
      <p class="pack-tasks-intro">Each world hosts exactly one unique task for this run. The agent is assigned the task for whichever world it hops to.</p>
      <table>
        <thead><tr><th>World</th><th>Task</th></tr></thead>
        <tbody>${assignmentRows}</tbody>
      </table>
    </section>`
    : "";

  const endedRow =
    isLive ?
      `<dt>Status</dt><dd>${statusBadge} updated ${fmtTime(data.updatedAt ?? data.startedAt)}</dd>`
    : `<dt>Ended</dt><dd>${fmtTime(data.endedAt)}</dd>`;

  const errorBlock =
    data.error ? `<div class="error-banner">${data.error}</div>` : "";

  const livePanel = isLive ? renderLiveAttempt(data, problems) : "";

  return `
    ${errorBlock}
    ${livePanel}
    <header class="results-header">
      <div>
        <h1>World-Hop Benchmark ${statusBadge}</h1>
        <p>${sourceLabel}</p>
      </div>
    </header>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Solved</div>
        <div class="stat-value num">${aggregates.totalSolvedDelta}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Slots</div>
        <div class="stat-value num">${aggregates.totalSlots}${data.currentSlot ? '<span class="stat-live">+</span>' : ""}</div>
      </div>
      <div class="stat">
        <div class="stat-label">${isLive ? "Elapsed" : "Run time"}</div>
        <div class="stat-value">${fmtDuration(runMs)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Max slot time</div>
        <div class="stat-value">${fmtDuration(config.slotMs)}</div>
      </div>
      ${
        avgSolveMs !== null
          ? `<div class="stat">
        <div class="stat-label">Avg solve time</div>
        <div class="stat-value">${fmtDuration(avgSolveMs)}</div>
      </div>`
          : ""
      }
      <div class="stat">
        <div class="stat-label">Worlds</div>
        <div class="stat-value num">${config.worldCount}</div>
      </div>
    </div>

    <section>
      <h2>Configuration</h2>
      <dl class="meta-grid">
        <dt>Model</dt><dd>${config.modelId}</dd>
        <dt>Task pack</dt><dd>${config.taskPack ?? "example"}</dd>
        <dt>Profile</dt><dd>${config.profileName ?? "—"}</dd>
        <dt>Seed</dt><dd class="num">${config.benchSeed}</dd>
        <dt>Started</dt><dd>${fmtTime(data.startedAt)}</dd>
        ${endedRow}
        <dt>Agent</dt><dd style="word-break:break-all;font-size:0.85rem">${data.agentId || "—"}</dd>
      </dl>
      <h2 style="margin-top:1.5rem">Tasks in this run</h2>
      ${problemsHtml}
    </section>

    ${assignmentsHtml}

    <section>
      <h2>World timeline</h2>
      <div class="timeline">${timeline || "<em>No slots yet</em>"}</div>
      <p class="timeline-legend">Each block is one slot; color = world id${data.currentSlot ? "; pulsing = in progress" : ""}</p>
    </section>

    <section>
      <h2>World visits &amp; solves</h2>
      <div class="world-grid">${worldGrid}</div>
    </section>

    <section>
      <h2>Slots</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>World</th>
            <th>Duration</th>
            <th>Exit</th>
            <th>Solved Δ</th>
            <th>MCP calls</th>
            <th>Chars</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${slotRows || `<tr><td colspan="8" class="empty-row">No completed slots yet</td></tr>`}</tbody>
      </table>
    </section>
  `;
}
