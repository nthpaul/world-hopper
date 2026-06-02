import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { BenchConfig, WorldEndpoint } from "./types.js";
import {
  loadBenchProfile,
  parseProblemIds,
  profileToConfigOverrides,
} from "./bench-config.js";
import { buildWorldEndpoints } from "./world-endpoints.js";
import {
  buildWorldAssignments,
  parseWorldAssignments,
  toStringKeyAssignments,
} from "./world-assignments.js";
import { listProblems as listPackProblems } from "./task-packs.js";

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export type ResolvedBenchConfig = BenchConfig;

function resolveWorldAssignments(
  benchSeed: number,
  worlds: WorldEndpoint[],
  problemIds: string[],
): Record<string, string> {
  const parsed = parseWorldAssignments(process.env.WORLD_ASSIGNMENTS);
  if (parsed) {
    return toStringKeyAssignments(parsed);
  }

  const built = buildWorldAssignments({
    seed: benchSeed,
    worldCount: worlds.length,
    problemIds,
  });
  return toStringKeyAssignments(built);
}

export function loadConfigFromEnv(): BenchConfig {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is required");
  }

  const worldCount = parseIntEnv("WORLD_COUNT", 8);
  const worlds = buildWorldEndpoints(worldCount, process.env.WORLD_URLS);
  const problemIds = parseProblemIds(process.env.PROBLEM_IDS);
  const benchSeed = parseIntEnv("BENCH_SEED", Date.now());
  const taskPack = process.env.TASK_PACK ?? "example";
  const activeProblemIds =
    problemIds ?? listPackProblems(taskPack).map((p) => p.id);
  const worldAssignments = resolveWorldAssignments(benchSeed, worlds, activeProblemIds);

  return {
    apiKey,
    slotMs: parseIntEnv("SLOT_MS", 5000),
    benchDurationMs: parseIntEnv("BENCH_DURATION_MS", 120_000),
    benchSeed,
    modelId: process.env.MODEL_ID ?? "composer-2.5",
    taskPack,
    problemIds,
    worldAssignments,
    agentStubCwd: process.env.AGENT_STUB_CWD ?? "/app/agent-stub",
    resultsDir: process.env.RESULTS_DIR ?? "/app/results",
    sandboxEnabled: process.env.LOCAL_SANDBOX_ENABLED === "true",
    worlds,
    profileName: process.env.BENCH_PROFILE,
  };
}

export function parseCliArgs(argv: string[]): {
  overrides: Partial<BenchConfig>;
  configPath?: string;
  listProblems: boolean;
  help: boolean;
} {
  const overrides: Partial<BenchConfig> = {};
  let configPath: string | undefined;
  let listProblems = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--list-problems") {
      listProblems = true;
    } else if (arg === "--config" && argv[i + 1]) {
      configPath = argv[++i];
    } else if (arg === "--worlds" && argv[i + 1]) {
      overrides.worlds = buildWorldEndpoints(Number.parseInt(argv[++i], 10));
    } else if (arg === "--duration" && argv[i + 1]) {
      overrides.benchDurationMs = Number.parseInt(argv[++i], 10) * 1000;
    } else if (arg === "--slot-ms" && argv[i + 1]) {
      overrides.slotMs = Number.parseInt(argv[++i], 10);
    } else if (arg === "--seed" && argv[i + 1]) {
      overrides.benchSeed = Number.parseInt(argv[++i], 10);
    } else if (arg === "--model" && argv[i + 1]) {
      overrides.modelId = argv[++i];
    } else if (arg === "--pack" && argv[i + 1]) {
      overrides.taskPack = argv[++i];
    } else if (arg === "--problems" && argv[i + 1]) {
      overrides.problemIds = parseProblemIds(argv[++i]);
    } else if (arg === "--results-dir" && argv[i + 1]) {
      overrides.resultsDir = argv[++i];
    } else if (arg === "--stub-cwd" && argv[i + 1]) {
      overrides.agentStubCwd = argv[++i];
    } else if (arg === "--world-url" && argv[i + 1]) {
      const existing = overrides.worlds ?? [];
      const url = argv[++i];
      existing.push({
        id: String(existing.length),
        mcpUrl: url.endsWith("/mcp") ? url : `${url.replace(/\/$/, "")}/mcp`,
        statusUrl: url.replace(/\/mcp$/, "").replace(/\/$/, "") + "/status",
      });
      overrides.worlds = existing;
    }
  }

  return { overrides, configPath, listProblems, help };
}

export function resolveBenchConfig(argv: string[]): BenchConfig {
  const { overrides, configPath, listProblems, help } = parseCliArgs(argv);
  if (help || listProblems) {
    return loadConfigFromEnv();
  }

  let base = loadConfigFromEnv();

  if (configPath) {
    const profile = loadBenchProfile(configPath);
    const fromProfile = profileToConfigOverrides(profile);
    base = {
      ...base,
      ...(fromProfile.modelId !== undefined ? { modelId: fromProfile.modelId } : {}),
      ...(fromProfile.slotMs !== undefined ? { slotMs: fromProfile.slotMs } : {}),
      ...(fromProfile.benchDurationMs !== undefined
        ? { benchDurationMs: fromProfile.benchDurationMs }
        : {}),
      ...(fromProfile.benchSeed !== undefined ? { benchSeed: fromProfile.benchSeed } : {}),
      ...(fromProfile.taskPack !== undefined ? { taskPack: fromProfile.taskPack } : {}),
      ...(fromProfile.problemIds !== undefined ? { problemIds: fromProfile.problemIds } : {}),
      ...(fromProfile.worldCount !== undefined
        ? { worlds: buildWorldEndpoints(fromProfile.worldCount) }
        : {}),
      profileName: profile.name ?? configPath,
    };
  } else if (process.env.BENCH_CONFIG) {
    const profile = loadBenchProfile(process.env.BENCH_CONFIG);
    const fromProfile = profileToConfigOverrides(profile);
    base = {
      ...base,
      ...(fromProfile.modelId !== undefined ? { modelId: fromProfile.modelId } : {}),
      ...(fromProfile.slotMs !== undefined ? { slotMs: fromProfile.slotMs } : {}),
      ...(fromProfile.benchDurationMs !== undefined
        ? { benchDurationMs: fromProfile.benchDurationMs }
        : {}),
      ...(fromProfile.benchSeed !== undefined ? { benchSeed: fromProfile.benchSeed } : {}),
      ...(fromProfile.taskPack !== undefined ? { taskPack: fromProfile.taskPack } : {}),
      ...(fromProfile.problemIds !== undefined ? { problemIds: fromProfile.problemIds } : {}),
      ...(fromProfile.worldCount !== undefined
        ? { worlds: buildWorldEndpoints(fromProfile.worldCount) }
        : {}),
      profileName: profile.name ?? process.env.BENCH_CONFIG,
    };
  }

  return {
    ...base,
    ...overrides,
    worlds: overrides.worlds ?? base.worlds,
    problemIds: overrides.problemIds ?? base.problemIds,
    taskPack: overrides.taskPack ?? base.taskPack,
    worldAssignments: resolveWorldAssignments(
      overrides.benchSeed ?? base.benchSeed,
      overrides.worlds ?? base.worlds,
      (overrides.problemIds ?? base.problemIds) ??
        listPackProblems(overrides.taskPack ?? base.taskPack).map((p) => p.id),
    ),
  };
}

export function printHelp(): void {
  console.log(`cursor-world-hop-bench orchestrator

Usage:
  npm run bench -- [options]

Options:
  --config <path>       Load bench profile JSON (model, slotMs, duration, pack, problems)
  --model <id>            SDK model id (default: composer-2.5)
  --slot-ms <ms>          Max time per world slot; ends early on successful submit (default: 5000)
  --duration <sec>        Total benchmark duration in seconds
  --pack <name>           Task pack under task-packs/ (default: example)
  --problems <ids>        Comma-separated problem ids to enable (default: all in pack)
  --worlds <n>            Number of world containers
  --world-url <url>       Add a world MCP base URL (repeatable, local dev)
  --seed <n>              RNG seed for world selection
  --list-problems         List problems in --pack and exit
  --help                  Show this help

Environment:
  CURSOR_API_KEY          Required
  BENCH_CONFIG            Path to bench profile JSON (alternative to --config)
  TASK_PACK, PROBLEM_IDS, WORLD_ASSIGNMENTS  Must match world containers when using Docker
  SLOT_MS, BENCH_DURATION_MS, MODEL_ID, WORLD_COUNT

Examples:
  npm run bench -- --config configs/math-only.json
  npm run bench -- --model auto --slot-ms 30000 --problems math-quiz,find-flag
  npm run bench -- --list-problems --pack example
`);
}
