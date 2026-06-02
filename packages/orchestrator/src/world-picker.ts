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
  activeProblems?: string[],
): string {
  const problemHint =
    activeProblems && activeProblems.length > 0
      ? `Active problems this run: ${activeProblems.join(", ")}`
      : "Call list_problems to see available problems";

  return [
    `BENCHMARK SLOT ${slotIndex}: You are connected ONLY to world-${world.id} via the "world" MCP server.`,
    `Time budget: ~${Math.round(slotMs / 1000)} seconds.`,
    "",
    "CRITICAL: Local shell/read/grep/glob tools are DISABLED. You MUST use world MCP tools only.",
    "",
    problemHint,
    "",
    "Required workflow:",
    "1. Call MCP tool list_problems on server 'world'",
    "2. Pick an unsolved problem (math-quiz is fastest if available)",
    "3. get_problem then read_file for artifacts under /world/...",
    "4. write_file or run_shell if needed, then submit(problemId, answer)",
    "",
    "Example: submit(problemId='math-quiz', answer='42') after reading quiz/question.txt",
    "",
    "Do NOT use local filesystem tools. Previous worlds do not exist here.",
  ].join("\n");
}
