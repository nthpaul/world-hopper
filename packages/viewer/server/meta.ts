import fs from "node:fs";
import path from "node:path";

export type BenchProfileMeta = {
  id: string;
  path: string;
  name?: string;
  model?: string;
  slotMs?: number;
  durationSec?: number;
  benchDurationMs?: number;
  benchSeed?: number;
  taskPack?: string;
  problems?: string[];
  worldCount?: number;
};

export type ProblemMeta = {
  id: string;
  title: string;
  prompt: string;
  artifacts?: string[];
  allowShell?: boolean;
  allowMove?: boolean;
  layoutText?: string;
};

export type TaskPackMeta = {
  id: string;
  problems: ProblemMeta[];
};

export type MetaResponse = {
  taskPacks: TaskPackMeta[];
  defaults: {
    model: string;
    slotMs: number;
    durationSec: number;
    benchSeed: number;
    taskPack: string;
    worldCount: number;
  };
};

export function loadMeta(root: string): MetaResponse {
  const configsDir = path.join(root, "configs");
  let quickDefaults: Partial<BenchProfileMeta> | undefined;

  if (fs.existsSync(configsDir)) {
    const quickPath = path.join(configsDir, "quick.json");
    if (fs.existsSync(quickPath)) {
      quickDefaults = JSON.parse(fs.readFileSync(quickPath, "utf8")) as BenchProfileMeta;
    }
  }

  const taskPacks: TaskPackMeta[] = [];
  const packsDir = path.join(root, "task-packs");
  if (fs.existsSync(packsDir)) {
    for (const id of fs.readdirSync(packsDir).sort()) {
      const manifestPath = path.join(packsDir, id, "manifest.json");
      if (!fs.statSync(path.join(packsDir, id)).isDirectory()) continue;
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        problems: Array<{
          id: string;
          title: string;
          prompt: string;
          artifacts?: string[];
          allowShell?: boolean;
          allowMove?: boolean;
          mazeLayout?: string;
        }>;
      };
      const problemsDir = path.join(packsDir, id, "problems");
      taskPacks.push({
        id,
        problems: manifest.problems.map((p) => {
          let layoutText: string | undefined;
          if (p.mazeLayout) {
            const layoutPath = path.join(problemsDir, p.mazeLayout);
            if (fs.existsSync(layoutPath)) {
              layoutText = fs.readFileSync(layoutPath, "utf8");
            }
          }
          return {
            id: p.id,
            title: p.title,
            prompt: p.prompt,
            artifacts: p.artifacts,
            allowShell: p.allowShell,
            allowMove: p.allowMove,
            layoutText,
          };
        }),
      });
    }
  }

  const quick = quickDefaults;

  return {
    taskPacks,
    defaults: {
      model: quick?.model ?? "composer-2.5",
      slotMs: quick?.slotMs ?? 15000,
      durationSec: quick?.durationSec ?? 60,
      benchSeed: quick?.benchSeed ?? 42,
      taskPack: quick?.taskPack ?? "example",
      worldCount: quick?.worldCount ?? 8,
    },
  };
}

export function loadDotEnv(root: string): Record<string, string> {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}
