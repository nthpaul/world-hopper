#!/usr/bin/env node
/**
 * Load a bench profile JSON and run docker compose with matching env vars.
 * Usage: node scripts/run-compose-bench.mjs configs/quick.json
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildComposeEnv } from "./bench-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = process.argv[2] ?? "configs/quick.json";
const resolved = resolve(root, configPath);

if (!existsSync(resolved)) {
  console.error(`Config not found: ${resolved}`);
  process.exit(1);
}

const profile = JSON.parse(readFileSync(resolved, "utf8"));

let env;
let worldCount;
try {
  ({ env, worldCount } = buildComposeEnv(
    profile,
    root,
    readFileSync,
    existsSync,
    join,
    process.env,
    { benchProfile: profile.name ?? configPath },
  ));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

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
