#!/usr/bin/env node
/**
 * Load a bench profile JSON and run docker compose with matching env vars.
 * Usage: node scripts/run-compose-bench.mjs configs/quick.json
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  buildWorldAssignments,
  formatWorldAssignments,
  resolveProblemIds,
  validateBenchDuration,
} from "./world-assignments.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = process.argv[2] ?? "configs/quick.json";
const resolved = resolve(root, configPath);

if (!existsSync(resolved)) {
  console.error(`Config not found: ${resolved}`);
  process.exit(1);
}

const profile = JSON.parse(readFileSync(resolved, "utf8"));
const env = { ...process.env };

if (profile.model) env.MODEL_ID = profile.model;
if (profile.slotMs !== undefined) env.SLOT_MS = String(profile.slotMs);
if (profile.benchDurationMs !== undefined) {
  env.BENCH_DURATION_MS = String(profile.benchDurationMs);
} else if (profile.durationSec !== undefined) {
  env.BENCH_DURATION_MS = String(profile.durationSec * 1000);
}
if (profile.benchSeed !== undefined) env.BENCH_SEED = String(profile.benchSeed);
if (profile.taskPack) env.TASK_PACK = profile.taskPack;
const worldCount = profile.worldCount ?? 8;
const problemIds = resolveProblemIds(profile, root, readFileSync, existsSync, join);
const slotMs = profile.slotMs ?? Number.parseInt(env.SLOT_MS ?? "5000", 10);
const benchDurationMs =
  profile.benchDurationMs ??
  (profile.durationSec !== undefined ? profile.durationSec * 1000 : undefined) ??
  Number.parseInt(env.BENCH_DURATION_MS ?? "120000", 10);

try {
  validateBenchDuration(slotMs, benchDurationMs, worldCount);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

env.PROBLEM_IDS = problemIds.join(",");
if (profile.worldCount !== undefined) env.WORLD_COUNT = String(profile.worldCount);
env.WORLD_ASSIGNMENTS = formatWorldAssignments(
  buildWorldAssignments({
    seed: profile.benchSeed ?? 42,
    worldCount,
    problemIds,
  }),
);
env.BENCH_PROFILE = profile.name ?? configPath;

console.log("Running bench profile:", env.BENCH_PROFILE);
console.log(
  JSON.stringify(
    {
      model: env.MODEL_ID,
      slotMs: env.SLOT_MS,
      benchDurationMs: env.BENCH_DURATION_MS,
      taskPack: env.TASK_PACK,
      problems: env.PROBLEM_IDS ?? "(all)",
      worldCount: env.WORLD_COUNT,
      worldAssignments: env.WORLD_ASSIGNMENTS,
    },
    null,
    2,
  ),
);

const worldServices = Array.from({ length: worldCount }, (_, i) => `world-${i}`);

const result = spawnSync(
  "docker",
  ["compose", "up", "--abort-on-container-exit", ...worldServices, "agent"],
  { stdio: "inherit", env, cwd: root },
);

process.exit(result.status ?? 1);
