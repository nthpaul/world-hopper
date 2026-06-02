import type { WorldEndpoint } from "./types.js";

export type Rng = () => number;

export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function pickRandomWorld(worlds: WorldEndpoint[], rng: Rng): WorldEndpoint {
  const index = Math.floor(rng() * worlds.length);
  return worlds[index]!;
}

export function buildSlotPrompt(
  world: WorldEndpoint,
  slotMs: number,
  slotIndex: number,
  assignedProblemId: string,
): string {
  return [
    `BENCHMARK SLOT ${slotIndex}: You are connected ONLY to world-${world.id} via the "world" MCP server.`,
    `Max time: ~${Math.round(slotMs / 1000)} seconds — you will hop to the next world as soon as this task is solved.`,
    "",
    `REQUIRED TASK: You must solve problem "${assignedProblemId}" on world-${world.id}. Do not work on any other problem.`,
    "",
    "CRITICAL: Local shell/read/grep/glob tools are DISABLED. You MUST use world MCP tools only.",
    "",
    "Required workflow:",
    `1. Call MCP tool get_problem on server 'world' with problemId="${assignedProblemId}"`,
    "2. read_file for artifacts under /world/... as needed",
    "3. write_file or run_shell if needed, then submit(problemId, answer)",
    "",
    `Example: submit(problemId='${assignedProblemId}', answer='...') after solving the problem`,
    "",
    "Do NOT use local filesystem tools. Previous worlds do not exist here.",
  ].join("\n");
}
