import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchResults, BenchRunStatus, LiveBenchResults, SlotRecord } from "./types.js";
import type { BenchConfig } from "./types.js";
import { listProblems } from "./task-packs.js";

export const LIVE_RESULTS_FILENAME = "live.json";

export function initResultsDir(resultsDir: string): void {
  mkdirSync(resultsDir, { recursive: true });
}

export function writeResults(resultsDir: string, results: BenchResults): string {
  initResultsDir(resultsDir);
  const filename = `${results.startedAt.replace(/[:.]/g, "-")}.json`;
  const path = join(resultsDir, filename);
  writeFileSync(path, JSON.stringify(results, null, 2));
  return path;
}

export function buildAggregates(slots: SlotRecord[]): BenchResults["aggregates"] {
  const perWorldVisitCount: Record<string, number> = {};
  const uniqueSolvedByWorld: Record<string, string[]> = {};
  let totalSolvedDelta = 0;

  for (const slot of slots) {
    perWorldVisitCount[slot.worldId] = (perWorldVisitCount[slot.worldId] ?? 0) + 1;
    totalSolvedDelta += slot.solvedDelta;
  }

  return {
    totalSlots: slots.length,
    totalSolvedDelta,
    uniqueSolvedByWorld,
    perWorldVisitCount,
  };
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

export function buildResultsConfig(config: BenchConfig): BenchResults["config"] {
  return {
    slotMs: config.slotMs,
    benchDurationMs: config.benchDurationMs,
    benchSeed: config.benchSeed,
    modelId: config.modelId,
    worldCount: config.worlds.length,
    taskPack: config.taskPack,
    problemIds: config.problemIds ?? listProblems(config.taskPack).map((p) => p.id),
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
    currentSlot?: LiveBenchResults["currentSlot"];
    error?: string;
    resultsFile?: string;
  },
): string {
  return writeLiveResults(resultsDir, {
    status: args.status,
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
