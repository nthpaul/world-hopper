import type { ProblemMeta } from "./types.js";

export function problemMapForPack(
  taskPacks: Array<{ id: string; problems: ProblemMeta[] }>,
  packId: string,
): Map<string, ProblemMeta> {
  const pack = taskPacks.find((p) => p.id === packId);
  return new Map((pack?.problems ?? []).map((p) => [p.id, p]));
}

export function problemsForRun(
  taskPacks: Array<{ id: string; problems: ProblemMeta[] }>,
  taskPack: string,
  problemIds?: string[],
): ProblemMeta[] {
  const pack = taskPacks.find((p) => p.id === taskPack);
  if (!pack) return [];
  if (!problemIds?.length) return pack.problems;
  const wanted = new Set(problemIds);
  return pack.problems.filter((p) => wanted.has(p.id));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderProblemDetail(problem: ProblemMeta, opts?: { solved?: boolean }): string {
  const artifacts =
    problem.artifacts?.length ?
      `<div class="problem-artifacts"><span class="problem-artifacts-label">Files</span> ${problem.artifacts.map((a) => `<code>${escapeHtml(a)}</code>`).join(", ")}</div>`
    : "";

  const flags = [
    problem.allowShell ? "shell" : null,
    problem.allowMove ? "interactive move" : null,
  ]
    .filter(Boolean)
    .map((f) => `<span class="problem-flag">${f}</span>`)
    .join(" ");

  const solvedBadge =
    opts?.solved === true ?
      `<span class="problem-solved-badge">solved</span>`
    : opts?.solved === false ?
      `<span class="problem-unsolved-badge">unsolved</span>`
    : "";

  return `<article class="problem-card">
    <header class="problem-card-header">
      <code class="problem-id">${escapeHtml(problem.id)}</code>
      <span class="problem-title">${escapeHtml(problem.title)}</span>
      ${solvedBadge}
      ${flags}
    </header>
    <p class="problem-prompt">${escapeHtml(problem.prompt)}</p>
    ${artifacts}
  </article>`;
}

export function renderProblemsReference(problems: ProblemMeta[]): string {
  if (!problems.length) return "<p>No tasks defined for this pack.</p>";
  return `<div class="problem-list">${problems.map((p) => renderProblemDetail(p)).join("")}</div>`;
}

export function renderProblemsRunSummary(
  problems: ProblemMeta[],
  solvedByWorld: Record<string, string[]>,
): string {
  if (!problems.length) return "<p>All problems in pack</p>";

  const solvedAnywhere = new Set<string>();
  for (const ids of Object.values(solvedByWorld)) {
    for (const id of ids) solvedAnywhere.add(id);
  }

  return `<div class="problem-list">${problems
    .map((p) => renderProblemDetail(p, { solved: solvedAnywhere.has(p.id) }))
    .join("")}</div>`;
}
