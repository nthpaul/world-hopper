import { Cursor } from "@cursor/sdk";

export type ModelOption = {
  id: string;
  displayName: string;
  description?: string;
  aliases?: string[];
};

const FALLBACK_MODELS: ModelOption[] = [
  { id: "default", displayName: "Auto", aliases: ["auto"] },
  { id: "composer-2.5", displayName: "Composer 2.5", aliases: ["composer", "composer-2-5"] },
  { id: "claude-opus-4-8", displayName: "Opus 4.8", aliases: ["opus-4.8", "opus-4-8"] },
  { id: "claude-sonnet-4-6", displayName: "Sonnet 4.6", aliases: ["sonnet-4.6", "sonnet-4-6"] },
  { id: "gpt-5.5", displayName: "GPT-5.5", aliases: ["gpt-5-5"] },
  { id: "gpt-5.3-codex", displayName: "Codex 5.3", aliases: ["codex-5.3"] },
];

let cache: { fetchedAt: number; models: ModelOption[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

function sortModels(models: ModelOption[]): ModelOption[] {
  return [...models].sort((a, b) => {
    if (a.id === "default") return -1;
    if (b.id === "default") return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

export async function listSelectableModels(apiKey?: string): Promise<ModelOption[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.models;
  }

  if (!apiKey) {
    return sortModels(FALLBACK_MODELS);
  }

  try {
    const raw = await Cursor.models.list({ apiKey });
    const models = sortModels(
      raw.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        description: m.description,
        aliases: m.aliases,
      })),
    );
    cache = { fetchedAt: Date.now(), models };
    return models;
  } catch {
    return sortModels(FALLBACK_MODELS);
  }
}

export function resolveModelId(requested: string | undefined, models: ModelOption[]): string {
  if (!requested) return models[0]?.id ?? "composer-2.5";
  const exact = models.find((m) => m.id === requested);
  if (exact) return exact.id;
  const lower = requested.toLowerCase();
  const byAlias = models.find(
    (m) =>
      m.aliases?.some((a) => a.toLowerCase() === lower) ||
      m.id.toLowerCase() === lower ||
      m.displayName.toLowerCase() === lower,
  );
  if (byAlias) return byAlias.id;
  return requested;
}

export function modelLabel(modelId: string, models: ModelOption[]): string {
  const match = models.find((m) => m.id === modelId);
  return match?.displayName ?? modelId;
}
