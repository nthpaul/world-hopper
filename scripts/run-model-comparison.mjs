#!/usr/bin/env node
/**
 * Multi-model comparison sweep (see configs/model-comparison/manifest.json).
 * Usage: node scripts/run-model-comparison.mjs [--dry-run] [--only quick] [--only-model gpt-5.5] [--from-run 1] [--sleep-ms 5000] [--no-build]
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildComposeEnv, comparisonProfileName } from "./bench-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "configs/model-comparison/manifest.json");
const resultsDir = join(root, "results");
const logPath = join(resultsDir, "comparison-run-log.jsonl");

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    onlySuite: null,
    onlyModel: null,
    fromRun: 1,
    sleepMs: 0,
    noBuild: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--no-build") opts.noBuild = true;
    else if (arg === "--only" && argv[i + 1]) opts.onlySuite = argv[++i];
    else if (arg === "--only-model" && argv[i + 1]) opts.onlyModel = argv[++i];
    else if (arg === "--from-run" && argv[i + 1]) opts.fromRun = Number.parseInt(argv[++i], 10);
    else if (arg === "--sleep-ms" && argv[i + 1]) opts.sleepMs = Number.parseInt(argv[++i], 10);
    else {
      console.error(`Unknown arg: ${arg}`);
      process.exit(1);
    }
  }
  return opts;
}

function listResultJsonFiles() {
  if (!existsSync(resultsDir)) return new Set();
  return new Set(
    readdirSync(resultsDir).filter(
      (f) => f.endsWith(".json") && f !== "live.json",
    ),
  );
}

function findNewResultFile(before, afterStartedMs) {
  const candidates = [];
  for (const f of readdirSync(resultsDir)) {
    if (!f.endsWith(".json") || f === "live.json" || before.has(f)) continue;
    const full = join(resultsDir, f);
    try {
      const st = statSync(full);
      if (st.mtimeMs >= afterStartedMs - 2000) candidates.push({ f, mtime: st.mtimeMs });
    } catch {
      /* skip */
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.f ?? null;
}

function sleep(ms) {
  if (ms <= 0) return;
  spawnSync("sleep", [String(Math.ceil(ms / 1000))], { stdio: "inherit" });
}

function appendLog(row) {
  mkdirSync(resultsDir, { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(row)}\n`);
}

function main() {
  const opts = parseArgs(process.argv);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const runs = [];
  for (const model of manifest.models) {
    if (opts.onlyModel && model.id !== opts.onlyModel) continue;
    for (const suitePath of manifest.suites) {
      const profile = JSON.parse(readFileSync(resolve(root, suitePath), "utf8"));
      const suiteName = profile.name ?? basename(suitePath, ".json");
      if (opts.onlySuite && suiteName !== opts.onlySuite) continue;
      for (const seed of manifest.seeds) {
        runs.push({ model, suitePath, suiteName, profile, seed });
      }
    }
  }

  console.log(`Comparison sweep: ${runs.length} runs (from #${opts.fromRun})`);
  if (opts.dryRun) {
    runs.forEach((r, i) => {
      const pn = comparisonProfileName(r.suiteName, r.model.id, r.seed);
      console.log(
        `${i + 1}. ${pn} model=${r.model.id} suite=${r.suiteName} seed=${r.seed}`,
      );
    });
    return;
  }

  if (!process.env.CURSOR_API_KEY) {
    console.error("CURSOR_API_KEY is required (set in .env or environment)");
    process.exit(1);
  }

  if (!opts.noBuild) {
    console.log("Building docker images (agent + worlds)...");
    const build = spawnSync("docker", ["compose", "build"], {
      stdio: "inherit",
      cwd: root,
      env: process.env,
    });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }

  mkdirSync(resultsDir, { recursive: true });

  for (let i = 0; i < runs.length; i++) {
    const runIndex = i + 1;
    if (runIndex < opts.fromRun) continue;

    const { model, suitePath, suiteName, profile, seed } = runs[i];
    const benchProfile = comparisonProfileName(suiteName, model.id, seed);

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
        { modelId: model.id, benchSeed: seed, benchProfile },
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${runIndex}/${runs.length}] SKIP ${benchProfile}: ${msg}`);
      appendLog({
        runIndex,
        benchProfile,
        modelId: model.id,
        modelLabel: model.label,
        suite: suiteName,
        seed,
        exitCode: -1,
        error: msg,
        at: new Date().toISOString(),
      });
      continue;
    }

    const before = listResultJsonFiles();
    const startedAt = Date.now();
    const worldServices = Array.from({ length: worldCount }, (_, n) => `world-${n}`);

    console.log(
      `\n[${runIndex}/${runs.length}] ${benchProfile} (${model.label}, seed ${seed})`,
    );
    console.log(
      JSON.stringify(
        {
          model: env.MODEL_ID,
          slotMs: env.SLOT_MS,
          benchDurationMs: env.BENCH_DURATION_MS,
          taskPack: env.TASK_PACK,
          worldCount: env.WORLD_COUNT,
        },
        null,
        2,
      ),
    );

    const result = spawnSync(
      "docker",
      ["compose", "up", "--abort-on-container-exit", ...worldServices, "agent"],
      { stdio: "inherit", env, cwd: root },
    );

    const exitCode = result.status ?? 1;
    const resultsFile = findNewResultFile(before, startedAt);

    appendLog({
      runIndex,
      benchProfile,
      modelId: model.id,
      modelLabel: model.label,
      suite: suiteName,
      seed,
      exitCode,
      resultsFile,
      suitePath,
      at: new Date().toISOString(),
    });

    console.log(
      `[${runIndex}/${runs.length}] done exit=${exitCode} results=${resultsFile ?? "(none)"}`,
    );

    if (opts.sleepMs > 0 && runIndex < runs.length) sleep(opts.sleepMs);
  }

  console.log(`\nSweep complete. Log: ${logPath}`);
}

main();
