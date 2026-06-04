import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchResults, BenchRunStatus, LiveBenchResults, SlotRecord } from "./types.js";
import type { BenchConfig } from "./types.js";
import { listProblems } from "./task-packs.js";
import { buildResultsFilename, buildRunName } from "./run-name.js";

export const LIVE_RESULTS_FILENAME = "live.json";

export function initResultsDir(resultsDir: string): void {
  mkdirSync(resultsDir, { recursive: true });
}

export function writeResults(resultsDir: string, results: BenchResults): string {
  initResultsDir(resultsDir);
  const runName = results.runName ?? buildRunName(results.config);
  const filename = buildResultsFilename(runName, results.startedAt);
  const path = join(resultsDir, filename);
  writeFileSync(path, JSON.stringify({ ...results, runName }, null, 2));
  return path;
}

export function buildAggregates(
  slots: SlotRecord[],
  tasksTotal: number,
): BenchResults["aggregates"] {
  const perWorldVisitCount: Record<string, number> = {};
  const uniqueSolvedByWorld: Record<string, string[]> = {};
  let totalSolvedDelta = 0;

  for (const slot of slots) {
    perWorldVisitCount[slot.worldId] = (perWorldVisitCount[slot.worldId] ?? 0) + 1;
    totalSolvedDelta += slot.solvedDelta;
  }

  const tasksAttempted = slots.length;
  const tasksSolved = slots.filter((slot) => slot.exitReason === "solved").length;
  const totalSolveDurationMs = slots
    .filter((slot) => slot.exitReason === "solved")
    .reduce((sum, slot) => sum + (slot.solveDurationMs ?? 0), 0);

  return {
    totalSlots: slots.length,
    totalSolvedDelta,
    uniqueSolvedByWorld,
    perWorldVisitCount,
    tasksTotal,
    tasksAttempted,
    tasksSolved,
    totalSolveDurationMs,
    solveRate: tasksTotal > 0 ? tasksSolved / tasksTotal : 0,
  };
}

/** Rebuild slot-derived aggregates without dropping per-world solve snapshots. */
export function rebuildAggregates(
  slots: SlotRecord[],
  tasksTotal: number,
  previousUniqueSolvedByWorld: Record<string, string[]>,
): BenchResults["aggregates"] {
  const aggregates = buildAggregates(slots, tasksTotal);
  for (const [worldId, solvedIds] of Object.entries(previousUniqueSolvedByWorld)) {
    mergeWorldSnapshots(aggregates, worldId, solvedIds);
  }
  return aggregates;
}

export function mergeWorldSnapshots(
  aggregates: BenchResults["aggregates"],
  worldId: string,
  solvedIds: string[],
): void {
  const existing = new Set(aggregates.uniqueSolvedByWorld[worldId] ?? []);
  for (const id of solvedIds) existing.add(id);
  aggregates.uniqueSolvedByWorld[worldId] = [...existing];
}

export function reconcileTasksSolved(
  aggregates: BenchResults["aggregates"],
  worldAssignments: Record<string, string> | undefined,
): void {
  if (!worldAssignments) return;

  let tasksSolved = 0;
  for (const [worldId, problemId] of Object.entries(worldAssignments)) {
    const solved = aggregates.uniqueSolvedByWorld[worldId] ?? [];
    if (solved.includes(problemId)) tasksSolved += 1;
  }

  aggregates.tasksSolved = tasksSolved;
  aggregates.solveRate = aggregates.tasksTotal > 0 ? tasksSolved / aggregates.tasksTotal : 0;
}

export function buildResultsConfig(config: BenchConfig): BenchResults["config"] {
  return {
    slotMs: config.slotMs,
    benchDurationMs: config.benchDurationMs,
    benchSeed: config.benchSeed,
    modelId: config.modelId,
    worldCount: config.worlds.length,
    taskPack: config.taskPack,
    problemIds: config.problemIds ?? listProblems(config.taskPack).map((p) => p.id),
    worldAssignments: config.worldAssignments,
    worldVisitOrder: config.worldVisitOrder,
    profileName: config.profileName,
  };
}

export function writeLiveResults(
  resultsDir: string,
  partial: Omit<LiveBenchResults, "updatedAt"> & { updatedAt?: string },
): string {
  initResultsDir(resultsDir);
  const path = join(resultsDir, LIVE_RESULTS_FILENAME);
  const payload: LiveBenchResults = {
    ...partial,
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}

export function publishLiveResults(
  resultsDir: string,
  args: {
    status: BenchRunStatus;
    startedAt: string;
    endedAt: string;
    config: BenchConfig;
    agentId: string;
    slots: SlotRecord[];
    aggregates: BenchResults["aggregates"];
    runName?: string;
    currentSlot?: LiveBenchResults["currentSlot"];
    error?: string;
    resultsFile?: string;
  },
): string {
  const runName = args.runName ?? buildRunName(args.config);
  return writeLiveResults(resultsDir, {
    status: args.status,
    runName,
    startedAt: args.startedAt,
    endedAt: args.endedAt,
    config: buildResultsConfig(args.config),
    agentId: args.agentId,
    slots: args.slots,
    aggregates: args.aggregates,
    currentSlot: args.currentSlot,
    error: args.error,
    resultsFile: args.resultsFile,
  });
}
