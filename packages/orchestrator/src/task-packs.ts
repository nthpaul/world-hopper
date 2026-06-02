import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ProblemInfo = {
  id: string;
  title: string;
  packId: string;
};

function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

export function listTaskPacks(): string[] {
  const packsDir = join(repoRoot(), "task-packs");
  if (!existsSync(packsDir)) return [];
  return readdirSync(packsDir).filter((name) => {
    if (name === "schema.json") return false;
    return statSync(join(packsDir, name)).isDirectory();
  });
}

export function listProblems(taskPack: string): ProblemInfo[] {
  const manifestPath = join(repoRoot(), "task-packs", taskPack, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Task pack "${taskPack}" not found at ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    packId: string;
    problems: Array<{ id: string; title: string }>;
  };
  return manifest.problems.map((p) => ({
    id: p.id,
    title: p.title,
    packId: manifest.packId,
  }));
}

export function resolveTaskPackPath(taskPack: string): string {
  return resolve(repoRoot(), "task-packs", taskPack);
}
