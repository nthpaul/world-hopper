import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Problem, TaskPackManifest } from "./types.js";

export type LoadedTaskPack = {
  manifest: TaskPackManifest;
  worldRoot: string;
  problems: Map<string, Problem>;
  activeProblemIds: string[];
};

function resolvePackPath(taskPackPath: string): string {
  if (taskPackPath.startsWith("/")) return taskPackPath;
  const repoRoot =
    process.env.REPO_ROOT ??
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  return resolve(repoRoot, taskPackPath);
}

function parseProblemFilter(): string[] | undefined {
  const raw = process.env.PROBLEM_IDS;
  if (!raw?.trim()) return undefined;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export function loadTaskPack(taskPackPath: string, worldRoot: string): LoadedTaskPack {
  const resolvedPackPath = resolvePackPath(taskPackPath);
  const manifestPath = join(resolvedPackPath, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest.json not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as TaskPackManifest;
  const filter = parseProblemFilter();
  const filteredProblems =
    filter !== undefined
      ? manifest.problems.filter((p) => filter.includes(p.id))
      : manifest.problems;

  if (filter !== undefined && filteredProblems.length === 0) {
    throw new Error(
      `PROBLEM_IDS [${filter.join(", ")}] matched no problems in pack "${manifest.packId}"`,
    );
  }

  if (filter !== undefined) {
    const missing = filter.filter((id) => !manifest.problems.some((p) => p.id === id));
    if (missing.length > 0) {
      throw new Error(`Unknown problem ids in PROBLEM_IDS: ${missing.join(", ")}`);
    }
  }

  mkdirSync(worldRoot, { recursive: true });

  const problemsDir = join(resolvedPackPath, "problems");
  if (existsSync(problemsDir)) {
    cpSync(problemsDir, worldRoot, { recursive: true });
  }

  const problems = new Map<string, Problem>();
  for (const problem of filteredProblems) {
    problems.set(problem.id, problem);
  }

  const activeManifest: TaskPackManifest = {
    ...manifest,
    problems: filteredProblems,
  };

  return {
    manifest: activeManifest,
    worldRoot,
    problems,
    activeProblemIds: filteredProblems.map((p) => p.id),
  };
}

export function resolveWorldPath(worldRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/^\/world\/?/, "");
  const resolved = resolve(worldRoot, normalized);
  if (!resolved.startsWith(resolve(worldRoot))) {
    throw new Error(`Path escapes world root: ${relativePath}`);
  }
  return resolved;
}

export function toWorldRelative(worldRoot: string, absolutePath: string): string {
  return absolutePath.slice(worldRoot.length).replace(/^\//, "");
}

export function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}
