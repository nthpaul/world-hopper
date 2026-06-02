import { createSeededRng } from "./world-picker.js";

export type WorldAssignments = Record<number, string>;

export function validateWorldTaskCount(worldCount: number, problemCount: number): void {
  if (worldCount !== problemCount) {
    throw new Error(
      `World count must equal task count (${worldCount} worlds, ${problemCount} tasks selected)`,
    );
  }
}

export function buildWorldAssignments(args: {
  seed: number;
  worldCount: number;
  problemIds: string[];
}): WorldAssignments {
  const { seed, worldCount, problemIds } = args;
  validateWorldTaskCount(worldCount, problemIds.length);

  const rng = createSeededRng(seed);
  const shuffled = [...problemIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  const assignments: WorldAssignments = {};
  for (let worldId = 0; worldId < worldCount; worldId++) {
    assignments[worldId] = shuffled[worldId]!;
  }
  return assignments;
}

export function formatWorldAssignments(assignments: WorldAssignments): string {
  return Object.entries(assignments)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([worldId, problemId]) => `${worldId}:${problemId}`)
    .join(",");
}

export function parseWorldAssignments(raw: string | undefined): WorldAssignments | undefined {
  if (!raw?.trim()) return undefined;

  const assignments: WorldAssignments = {};
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) {
      throw new Error(`Invalid WORLD_ASSIGNMENTS entry: ${trimmed}`);
    }
    const worldId = Number.parseInt(trimmed.slice(0, colon), 10);
    const problemId = trimmed.slice(colon + 1);
    if (!Number.isFinite(worldId) || !problemId) {
      throw new Error(`Invalid WORLD_ASSIGNMENTS entry: ${trimmed}`);
    }
    assignments[worldId] = problemId;
  }

  return Object.keys(assignments).length > 0 ? assignments : undefined;
}

export function toStringKeyAssignments(
  assignments: WorldAssignments,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(assignments).map(([worldId, problemId]) => [String(worldId), problemId]),
  );
}

export function getAssignedProblemId(
  assignments: Record<string, string>,
  worldId: string,
): string {
  const problemId = assignments[worldId];
  if (!problemId) {
    throw new Error(`No task assigned to world-${worldId}`);
  }
  return problemId;
}
