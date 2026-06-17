export type BenchRunStatus = "starting" | "running" | "complete" | "failed" | "stopped";

export type ModelOption = {
  id: string;
  displayName: string;
  description?: string;
  aliases?: string[];
};

export type ModelsResponse = {
  models: ModelOption[];
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
  activity?: LiveActivityEvent[];
  maze?: LiveMazeState;
};

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
    taskPack?: string;
    problemIds?: string[];
    worldAssignments?: Record<string, string>;
    worldVisitOrder?: string[];
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
    activityCount?: number;
    lastProblemId?: string;
    maze?: LiveMazeState;
    exitReason?: "solved" | "timeout";
    solveDurationMs?: number;
    activity?: LiveActivityEvent[];
  }>;
  aggregates: {
    totalSlots: number;
    totalSolvedDelta: number;
    uniqueSolvedByWorld: Record<string, string[]>;
    perWorldVisitCount: Record<string, number>;
    tasksTotal?: number;
    tasksAttempted?: number;
    tasksSolved?: number;
    totalSolveDurationMs?: number;
    solveRate?: number;
  };
  status?: BenchRunStatus;
  updatedAt?: string;
  resultsFile?: string;
  error?: string;
  currentSlot?: LiveCurrentSlot;
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

export type MetaResponse = {
  taskPacks: Array<{ id: string; problems: ProblemMeta[] }>;
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

export type RunListEntry = {
  file: string;
  label: string;
};

export type BenchStatus = {
  running: boolean;
  startedAt: string | null;
  exitCode: number | null;
  config: BenchStartRequest | null;
  error: string | null;
};
