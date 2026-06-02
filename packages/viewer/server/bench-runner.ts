import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadDotEnv } from "./meta.js";

export type BenchStartRequest = {
  profile?: string;
  name?: string;
  model?: string;
  slotMs?: number;
  durationSec?: number;
  benchSeed?: number;
  taskPack?: string;
  problems?: string[];
  worldCount?: number;
};

export type BenchStatus = {
  running: boolean;
  startedAt: string | null;
  exitCode: number | null;
  config: BenchStartRequest | null;
  error: string | null;
};

let activeProcess: ChildProcess | null = null;
let activeStartedAt: string | null = null;
let activeConfig: BenchStartRequest | null = null;
let activeExitCode: number | null = null;
let activeError: string | null = null;
let repoRoot = "";

export function initBenchRunner(root: string): void {
  repoRoot = root;
}

function mergeProfile(config: BenchStartRequest): BenchStartRequest {
  if (!config.profile) return config;
  const profilePath = path.join(
    repoRoot,
    config.profile.startsWith("configs/") ? config.profile : `configs/${config.profile}.json`,
  );
  if (!fs.existsSync(profilePath)) return config;
  const profile = JSON.parse(fs.readFileSync(profilePath, "utf8")) as BenchStartRequest;
  return {
    ...profile,
    ...config,
    name: config.name ?? profile.name ?? config.profile,
  };
}

function buildEnv(config: BenchStartRequest): Record<string, string> {
  const merged = mergeProfile(config);
  const dotenv = loadDotEnv(repoRoot);
  const env: Record<string, string> = { ...process.env, ...dotenv } as Record<string, string>;

  if (merged.model) env.MODEL_ID = merged.model;
  if (merged.slotMs !== undefined) env.SLOT_MS = String(merged.slotMs);
  if (merged.durationSec !== undefined) {
    env.BENCH_DURATION_MS = String(merged.durationSec * 1000);
  }
  if (merged.benchSeed !== undefined) env.BENCH_SEED = String(merged.benchSeed);
  if (merged.taskPack) env.TASK_PACK = merged.taskPack;
  if (merged.problems?.length) env.PROBLEM_IDS = merged.problems.join(",");
  else env.PROBLEM_IDS = "";
  if (merged.worldCount !== undefined) env.WORLD_COUNT = String(merged.worldCount);
  env.BENCH_PROFILE = merged.name ?? merged.profile ?? "custom";

  return env;
}

function writeStartingLive(config: BenchStartRequest): void {
  const resultsDir = path.join(repoRoot, "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const merged = mergeProfile(config);
  const durationMs = (merged.durationSec ?? 60) * 1000;
  const payload = {
    status: "starting",
    updatedAt: startedAt,
    startedAt,
    endedAt: startedAt,
    config: {
      slotMs: merged.slotMs ?? 15000,
      benchDurationMs: durationMs,
      benchSeed: merged.benchSeed ?? 42,
      modelId: merged.model ?? "composer-2.5",
      worldCount: merged.worldCount ?? 8,
      taskPack: merged.taskPack ?? "example",
      problemIds: merged.problems,
      profileName: merged.name ?? merged.profile,
    },
    agentId: "",
    slots: [],
    aggregates: {
      totalSlots: 0,
      totalSolvedDelta: 0,
      uniqueSolvedByWorld: {},
      perWorldVisitCount: {},
    },
  };
  fs.writeFileSync(path.join(resultsDir, "live.json"), JSON.stringify(payload, null, 2));
}

export function getBenchStatus(): BenchStatus {
  const running = activeProcess !== null && activeProcess.exitCode === null;
  return {
    running,
    startedAt: activeStartedAt,
    exitCode: running ? null : activeExitCode,
    config: activeConfig,
    error: activeError,
  };
}

export function startBench(config: BenchStartRequest): { ok: true } | { ok: false; error: string } {
  if (activeProcess && activeProcess.exitCode === null) {
    return { ok: false, error: "A benchmark is already running" };
  }

  const env = buildEnv(config);
  if (!env.CURSOR_API_KEY) {
    return { ok: false, error: "CURSOR_API_KEY not found in .env" };
  }

  activeConfig = mergeProfile(config);
  activeStartedAt = new Date().toISOString();
  activeExitCode = null;
  activeError = null;
  writeStartingLive(activeConfig);

  activeProcess = spawn(
    "docker",
    [
      "compose",
      "up",
      "--force-recreate",
      "--abort-on-container-exit",
      "world-0",
      "world-1",
      "world-2",
      "world-3",
      "world-4",
      "world-5",
      "world-6",
      "world-7",
      "agent",
    ],
    {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  activeProcess.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(`[bench] ${chunk}`);
  });
  activeProcess.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[bench] ${chunk}`);
  });

  activeProcess.on("exit", (code) => {
    activeExitCode = code;
    activeProcess = null;
    if (code !== 0 && code !== null) {
      activeError = `Benchmark exited with code ${code}`;
      markLiveStopped(activeError);
    }
  });

  return { ok: true };
}

function markLiveStopped(error: string): void {
  const livePath = path.join(repoRoot, "results", "live.json");
  if (!fs.existsSync(livePath)) return;
  try {
    const live = JSON.parse(fs.readFileSync(livePath, "utf8")) as Record<string, unknown>;
    if (live.status === "complete") return;
    live.status = "stopped";
    live.error = error;
    live.updatedAt = new Date().toISOString();
    fs.writeFileSync(livePath, JSON.stringify(live, null, 2));
  } catch {
    // ignore
  }
}

export function stopBench(): { ok: boolean; error?: string } {
  if (!activeProcess || activeProcess.exitCode !== null) {
    return { ok: false, error: "No benchmark is running" };
  }

  activeProcess.kill("SIGTERM");
  spawn("docker", ["compose", "stop", "agent"], { cwd: repoRoot, stdio: "ignore" });
  markLiveStopped("Stopped from dashboard");
  activeProcess = null;
  activeExitCode = 130;
  return { ok: true };
}
