import { readFileSync, existsSync } from "node:fs";
import { resolve, basename, join } from "node:path";

export type BenchProfile = {
  name?: string;
  model?: string;
  slotMs?: number;
  benchDurationMs?: number;
  durationSec?: number;
  benchSeed?: number;
  taskPack?: string;
  problems?: string[];
  worldCount?: number;
};

export function loadBenchProfile(configPath: string): BenchProfile {
  const candidates = [
    resolve(configPath),
    join("/app/configs", basename(configPath)),
    join("/app/configs", configPath.replace(/^configs\//, "")),
  ];
  const resolved = candidates.find((p) => existsSync(p));
  if (!resolved) {
    throw new Error(`Bench config not found: ${configPath} (tried ${candidates.join(", ")})`);
  }
  return JSON.parse(readFileSync(resolved, "utf8")) as BenchProfile;
}

export function profileToConfigOverrides(profile: BenchProfile): {
  modelId?: string;
  slotMs?: number;
  benchDurationMs?: number;
  benchSeed?: number;
  taskPack?: string;
  problemIds?: string[];
  worldCount?: number;
} {
  return {
    modelId: profile.model,
    slotMs: profile.slotMs,
    benchDurationMs:
      profile.benchDurationMs ??
      (profile.durationSec !== undefined ? profile.durationSec * 1000 : undefined),
    benchSeed: profile.benchSeed,
    taskPack: profile.taskPack,
    problemIds: profile.problems,
    worldCount: profile.worldCount,
  };
}

export function parseProblemIds(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export function formatProblemIds(ids: string[] | undefined): string | undefined {
  return ids?.length ? ids.join(",") : undefined;
}
