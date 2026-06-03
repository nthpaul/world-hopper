/**
 * Build docker-compose env for a bench profile (shared by compose + comparison runners).
 */
import {
  buildWorldAssignments,
  formatWorldAssignments,
  resolveProblemIds,
  validateBenchDuration,
} from "./world-assignments.mjs";

/**
 * @param {Record<string, unknown>} profile
 * @param {string} root
 * @param {typeof import('node:fs').readFileSync} readFileSync
 * @param {typeof import('node:fs').existsSync} existsSync
 * @param {typeof import('node:path').join} join
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {{ modelId?: string; benchSeed?: number; benchProfile?: string }} overrides
 */
export function buildComposeEnv(
  profile,
  root,
  readFileSync,
  existsSync,
  join,
  baseEnv,
  overrides = {},
) {
  const env = { ...baseEnv };
  const benchSeed = overrides.benchSeed ?? profile.benchSeed ?? 42;

  if (overrides.modelId ?? profile.model) {
    env.MODEL_ID = overrides.modelId ?? profile.model;
  }
  if (profile.slotMs !== undefined) env.SLOT_MS = String(profile.slotMs);
  if (profile.benchDurationMs !== undefined) {
    env.BENCH_DURATION_MS = String(profile.benchDurationMs);
  } else if (profile.durationSec !== undefined) {
    env.BENCH_DURATION_MS = String(profile.durationSec * 1000);
  }
  env.BENCH_SEED = String(benchSeed);
  if (profile.taskPack) env.TASK_PACK = profile.taskPack;

  const worldCount = profile.worldCount ?? 8;
  const problemIds = resolveProblemIds(profile, root, readFileSync, existsSync, join);
  const slotMs = profile.slotMs ?? Number.parseInt(env.SLOT_MS ?? "5000", 10);
  const benchDurationMs =
    profile.benchDurationMs ??
    (profile.durationSec !== undefined ? profile.durationSec * 1000 : undefined) ??
    Number.parseInt(env.BENCH_DURATION_MS ?? "120000", 10);

  validateBenchDuration(slotMs, benchDurationMs, worldCount);

  env.PROBLEM_IDS = problemIds.join(",");
  env.WORLD_COUNT = String(worldCount);
  env.WORLD_ASSIGNMENTS = formatWorldAssignments(
    buildWorldAssignments({ seed: benchSeed, worldCount, problemIds }),
  );
  env.BENCH_PROFILE =
    overrides.benchProfile ?? profile.name ?? "bench";

  return { env, worldCount, problemIds, slotMs, benchDurationMs, benchSeed };
}

export function slugifyModelId(modelId) {
  return modelId.replace(/^claude-/, "").replace(/\./g, "-");
}

export function comparisonProfileName(suiteName, modelId, seed) {
  return `compare-${suiteName}-${slugifyModelId(modelId)}-s${seed}`;
}
