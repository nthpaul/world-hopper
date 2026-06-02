export type CommandVerifier = {
  type: "command";
  cmd: string;
  timeoutMs?: number;
};

export type FileContainsVerifier = {
  type: "fileContains";
  path: string;
  expected: string;
};

export type JsonMatchVerifier = {
  type: "jsonMatch";
  expected: Record<string, unknown>;
};

export type MazePathVerifier = {
  type: "mazePath";
  layout: string;
};

export type MazeAtExitVerifier = {
  type: "mazeAtExit";
};

export type Verifier =
  | CommandVerifier
  | FileContainsVerifier
  | JsonMatchVerifier
  | MazePathVerifier
  | MazeAtExitVerifier;

export type Problem = {
  id: string;
  title: string;
  prompt: string;
  artifacts: string[];
  allowShell?: boolean;
  allowMove?: boolean;
  mazeLayout?: string;
  verify: Verifier;
};

export type TaskPackManifest = {
  packId: string;
  features?: string[];
  problems: Problem[];
};

export type WorldStatus = {
  worldId: string;
  packId: string;
  solvedCount: number;
  total: number;
  solvedIds: string[];
};
