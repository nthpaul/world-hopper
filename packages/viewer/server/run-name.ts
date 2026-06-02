export function shortenModelId(modelId: string): string {
  if (modelId === "default") return "auto";
  return modelId
    .replace(/^claude-/, "")
    .replace(/-thinking-high$/, "")
    .replace(/-thinking$/, "");
}

export function buildRunName(config: {
  modelId: string;
  benchDurationMs: number;
  slotMs: number;
  profileName?: string;
  taskPack?: string;
}): string {
  const durationSec = Math.round(config.benchDurationMs / 1000);
  const slotLabel =
    config.slotMs >= 1000 ?
      `${Math.round(config.slotMs / 1000)}s slots`
    : `${config.slotMs}ms slots`;
  const model = shortenModelId(config.modelId);
  const prefix = config.profileName ?? config.taskPack ?? "custom";
  return `${prefix} · ${model} · ${durationSec}s · ${slotLabel}`;
}

export function buildResultsFilename(runName: string, startedAt: string): string {
  const slug = runName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug}__${startedAt.replace(/[:.]/g, "-")}.json`;
}

export function labelForResults(
  data: {
    runName?: string;
    config?: {
      modelId: string;
      benchDurationMs: number;
      slotMs: number;
      profileName?: string;
      taskPack?: string;
    };
  },
  filename: string,
): string {
  if (data.runName) return data.runName;
  if (data.config) return buildRunName(data.config);
  return filename.replace(/\.json$/, "").replace(/__/g, " · ").replace(/T/, " ");
}
