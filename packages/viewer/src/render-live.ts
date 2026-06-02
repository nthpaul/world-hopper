import type { BenchResults, LiveActivityEvent, LiveMazeState, ProblemMeta } from "./types.js";
import { renderMazeGrid } from "./maze-render.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function activityBadge(event: LiveActivityEvent): string {
  if (event.ok === true) return `<span class="activity-badge activity-ok">ok</span>`;
  if (event.ok === false) return `<span class="activity-badge activity-fail">fail</span>`;
  return "";
}

function renderActivityItem(event: LiveActivityEvent): string {
  const kindClass = `activity-kind activity-kind-${event.kind}`;
  const detail = event.detail
    ? `<div class="activity-detail">${escapeHtml(event.detail)}</div>`
    : "";
  return `<li class="activity-item">
    <div class="activity-head">
      <span class="${kindClass}">${event.kind}</span>
      <span class="activity-label">${escapeHtml(event.label)}</span>
      ${activityBadge(event)}
      <span class="activity-time num">${new Date(event.at).toLocaleTimeString()}</span>
    </div>
    ${detail}
  </li>`;
}

function resolveMazeLayout(
  maze: LiveMazeState | undefined,
  problems: ProblemMeta[],
): string | undefined {
  if (!maze?.problemId) return undefined;
  return problems.find((p) => p.id === maze.problemId)?.layoutText;
}

export function renderLiveAttempt(
  data: BenchResults,
  problems: ProblemMeta[],
): string {
  const slot = data.currentSlot;
  if (!slot) return "";

  const elapsedMs = Date.now() - new Date(slot.startedAt).getTime();
  const slotMs = data.config.slotMs;
  const progress = Math.min(100, Math.max(0, (elapsedMs / slotMs) * 100));

  const activity = slot.activity ?? [];
  const activityHtml =
    activity.length > 0
      ? `<ul class="activity-feed" id="activity-feed">${activity.map(renderActivityItem).join("")}</ul>`
      : `<div class="activity-empty">Waiting for agent activity…</div>`;

  const layoutText = resolveMazeLayout(slot.maze, problems);
  const mazeHtml =
    layoutText && slot.maze
      ? renderMazeGrid({
          layoutText,
          path: slot.maze.path,
          position: slot.maze.position,
          atExit: slot.maze.atExit,
          problemId: slot.maze.problemId,
        })
      : layoutText
        ? renderMazeGrid({ layoutText, problemId: slot.maze?.problemId })
        : `<div class="maze-empty">No maze layout for current task</div>`;

  const submitNote =
    slot.maze?.lastSubmit
      ? `<div class="maze-submit-note ${slot.maze.lastSubmit.ok ? "maze-submit-ok" : "maze-submit-fail"}">
          Last submit: <code>${escapeHtml(slot.maze.lastSubmit.answer || "(none)")}</code>
        </div>`
      : "";

  return `
    <section class="live-attempt">
      <h2>Live attempt</h2>
      <div class="live-attempt-meta">
        Slot <span class="num">${slot.slotIndex}</span> ·
        world-<span class="num">${slot.worldId}</span> ·
        ${Math.max(0, elapsedMs / 1000).toFixed(1)}s / ${(slotMs / 1000).toFixed(0)}s
      </div>
      <div class="slot-progress" aria-hidden="true">
        <div class="slot-progress-bar" style="width:${progress.toFixed(1)}%"></div>
      </div>
      <div class="live-panels">
        <div class="live-panel live-panel-maze">
          <h3>Maze</h3>
          ${mazeHtml}
          ${submitNote}
        </div>
        <div class="live-panel live-panel-feed">
          <h3>Activity</h3>
          ${activityHtml}
        </div>
      </div>
    </section>
  `;
}

export function shouldAutoScrollFeed(feed: HTMLElement | null): boolean {
  if (!feed) return true;
  return feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
}

export function scrollActivityFeedToBottom(): void {
  const feed = document.getElementById("activity-feed");
  if (feed && shouldAutoScrollFeed(feed)) {
    feed.scrollTop = feed.scrollHeight;
  }
}
