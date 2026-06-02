export type BenchConfig = {
  apiKey: string;
  slotMs: number;
  benchDurationMs: number;
  benchSeed: number;
  modelId: string;
  taskPack: string;
  problemIds?: string[];
  worldAssignments: Record<string, string>;
  worldVisitOrder: string[];
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

export type WorldMazeStatus = {
  position: { x: number; y: number };
  atExit: boolean;
};

export type WorldStatusSnapshot = {
  worldId: string;
  packId: string;
  solvedCount: number;
  total: number;
  solvedIds: string[];
  mazes?: Record<string, WorldMazeStatus>;
};

export type LiveActivityEvent = {
  at: string;
  kind: "assistant" | "thinking" | "tool" | "world";
  label: string;
  detail?: string;
  ok?: boolean;
};

export type LiveMazeState = {
  problemId: string;
  position?: { x: number; y: number };
  path: string;
  atExit?: boolean;
  lastSubmit?: { answer: string; ok?: boolean };
};

export type LiveCurrentSlot = {
  slotIndex: number;
  worldId: string;
  startedAt: string;
  activity: LiveActivityEvent[];
  maze?: LiveMazeState;
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
  activityCount?: number;
  lastProblemId?: string;
  maze?: LiveMazeState;
  exitReason?: "solved" | "timeout";
  solveDurationMs?: number;
};

export type BenchRunStatus = "starting" | "running" | "complete" | "failed" | "stopped";

export type BenchResults = {
  runName?: string;
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
    worldAssignments?: Record<string, string>;
    worldVisitOrder?: string[];
    profileName?: string;
  };
  agentId: string;
  slots: SlotRecord[];
  aggregates: {
    totalSlots: number;
    totalSolvedDelta: number;
    uniqueSolvedByWorld: Record<string, string[]>;
    perWorldVisitCount: Record<string, number>;
    tasksTotal: number;
    tasksAttempted: number;
    tasksSolved: number;
    totalSolveDurationMs: number;
    solveRate: number;
  };
};

export type LiveBenchResults = BenchResults & {
  status: BenchRunStatus;
  updatedAt: string;
  resultsFile?: string;
  error?: string;
  currentSlot?: LiveCurrentSlot;
};
