export type BenchConfig = {
  apiKey: string;
  slotMs: number;
  benchDurationMs: number;
  benchSeed: number;
  modelId: string;
  taskPack: string;
  problemIds?: string[];
  agentStubCwd: string;
  resultsDir: string;
  sandboxEnabled: boolean;
  worlds: WorldEndpoint[];
  profileName?: string;
};

export type WorldEndpoint = {
  id: string;
  mcpUrl: string;
  statusUrl: string;
};

export type WorldStatusSnapshot = {
  worldId: string;
  packId: string;
  solvedCount: number;
  total: number;
  solvedIds: string[];
};

export type SlotRecord = {
  slotIndex: number;
  worldId: string;
  startedAt: string;
  endedAt: string;
  solvedBefore: number;
  solvedAfter: number;
  solvedDelta: number;
  runId?: string;
  runStatus?: string;
  assistantChars: number;
  mcpToolCalls: number;
};

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
    taskPack: string;
    problemIds?: string[];
    profileName?: string;
  };
  agentId: string;
  slots: SlotRecord[];
  aggregates: {
    totalSlots: number;
    totalSolvedDelta: number;
    uniqueSolvedByWorld: Record<string, string[]>;
    perWorldVisitCount: Record<string, number>;
  };
};

export type LiveBenchResults = BenchResults & {
  status: BenchRunStatus;
  updatedAt: string;
  resultsFile?: string;
  error?: string;
  currentSlot?: {
    slotIndex: number;
    worldId: string;
    startedAt: string;
  };
};
