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

function parseWorldAssignments(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) {
      throw new Error(`Invalid WORLD_ASSIGNMENTS entry: ${trimmed}`);
    }
    const worldId = trimmed.slice(0, colon);
    const problemId = trimmed.slice(colon + 1);
    if (!worldId || !problemId) {
      throw new Error(`Invalid WORLD_ASSIGNMENTS entry: ${trimmed}`);
    }
    map.set(worldId, problemId);
  }
  return map;
}

function getAssignedProblemIdForWorld(): string {
  const worldId = process.env.WORLD_ID;
  const raw = process.env.WORLD_ASSIGNMENTS;
  if (!worldId) {
    throw new Error("WORLD_ID is required");
  }
  if (!raw?.trim()) {
    throw new Error("WORLD_ASSIGNMENTS is required (one unique task per world)");
  }
  const assignments = parseWorldAssignments(raw);
  const problemId = assignments.get(worldId);
  if (!problemId) {
    throw new Error(`World ${worldId} has no task in WORLD_ASSIGNMENTS`);
  }
  return problemId;
}

export function loadTaskPack(taskPackPath: string, worldRoot: string): LoadedTaskPack {
  const resolvedPackPath = resolvePackPath(taskPackPath);
  const manifestPath = join(resolvedPackPath, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest.json not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as TaskPackManifest;
  const assignedProblemId = getAssignedProblemIdForWorld();
  const assigned = manifest.problems.find((p) => p.id === assignedProblemId);
  if (!assigned) {
    throw new Error(
      `Assigned problem "${assignedProblemId}" not found in pack "${manifest.packId}"`,
    );
  }
  const filteredProblems = [assigned];

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
