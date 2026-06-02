export type BenchRunStatus = "starting" | "running" | "complete" | "failed" | "stopped";

export type BenchResults = {
  startedAt: string;
  endedAt: string;
  config: {
    slotMs: number;
    benchDurationMs: number;
    benchSeed: number;
    modelId: string;
    worldCount: number;
    taskPack?: string;
    problemIds?: string[];
    profileName?: string;
  };
  agentId: string;
  slots: Array<{
    slotIndex: number;
    worldId: string;
    startedAt: string;
    endedAt: string;
    solvedBefore: number;
    solvedAfter: number;
    solvedDelta: number;
    runId?: string;
    runStatus?: string;
    assistantChars?: number;
    mcpToolCalls?: number;
  }>;
  aggregates: {
    totalSlots: number;
    totalSolvedDelta: number;
    uniqueSolvedByWorld: Record<string, string[]>;
    perWorldVisitCount: Record<string, number>;
  };
  status?: BenchRunStatus;
  updatedAt?: string;
  resultsFile?: string;
  error?: string;
  currentSlot?: {
    slotIndex: number;
    worldId: string;
    startedAt: string;
  };
};

export type BenchProfileMeta = {
  id: string;
  path: string;
  name?: string;
  model?: string;
  slotMs?: number;
  durationSec?: number;
  benchSeed?: number;
  taskPack?: string;
  problems?: string[];
  worldCount?: number;
};

export type MetaResponse = {
  profiles: BenchProfileMeta[];
  taskPacks: Array<{ id: string; problems: Array<{ id: string; title: string }> }>;
  defaults: {
    model: string;
    slotMs: number;
    durationSec: number;
    benchSeed: number;
    taskPack: string;
    worldCount: number;
  };
};

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
