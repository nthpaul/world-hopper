import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { resolveWorldPath } from "./task-loader.js";
import type { Verifier } from "./types.js";
import { parseMaze, simulatePath } from "./maze.js";

const execFileAsync = promisify(execFile);

export type VerifyContext = {
  worldRoot: string;
  problemId?: string;
  answer?: string;
  mazeAtExit?: (problemId: string) => boolean;
};

export type VerifyResult = {
  ok: boolean;
  message: string;
};

export async function runVerifier(
  verify: Verifier,
  ctx: VerifyContext,
): Promise<VerifyResult> {
  switch (verify.type) {
    case "command":
      return verifyCommand(verify.cmd, verify.timeoutMs ?? 5000, ctx.answer);
    case "fileContains":
      return verifyFileContains(ctx.worldRoot, verify.path, verify.expected);
    case "jsonMatch":
      return verifyJsonMatch(ctx.answer, verify.expected);
    case "mazePath":
      return verifyMazePath(ctx.worldRoot, verify.layout, ctx.answer);
    case "mazeAtExit":
      return verifyMazeAtExit(ctx.mazeAtExit, ctx.problemId);
    default:
      return { ok: false, message: "Unknown verifier type" };
  }
}

async function verifyCommand(
  cmd: string,
  timeoutMs: number,
  answer?: string,
): Promise<VerifyResult> {
  try {
    const env =
      answer !== undefined
        ? { ...process.env, SUBMIT_ANSWER: answer }
        : process.env;
    await execFileAsync("bash", ["-lc", cmd], { timeout: timeoutMs, env });
    return { ok: true, message: "command passed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

function verifyFileContains(
  worldRoot: string,
  relativePath: string,
  expected: string,
): VerifyResult {
  try {
    const filePath = resolveWorldPath(worldRoot, relativePath);
    const content = readFileSync(filePath, "utf8");
    if (content.includes(expected)) {
      return { ok: true, message: "file contains expected value" };
    }
    if (expected.startsWith("FLAG{") && content.includes(expected)) {
      return { ok: true, message: "flag found" };
    }
    return { ok: false, message: "expected substring not found in file" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

function verifyJsonMatch(answer: string | undefined, expected: Record<string, unknown>): VerifyResult {
  if (answer === undefined || answer.trim() === "") {
    return { ok: false, message: "submit answer required for jsonMatch verifier" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    parsed = undefined;
  }

  if (parsed === undefined) {
    const asNumber = Number(answer);
    if (!Number.isNaN(asNumber) && "answer" in expected) {
      parsed = { answer: asNumber };
    } else {
      parsed = { answer: answer.trim() };
    }
  } else if (typeof parsed !== "object" || parsed === null) {
    parsed = { answer: parsed };
  }

  for (const [key, value] of Object.entries(expected)) {
    if ((parsed as Record<string, unknown>)[key] !== value) {
      return { ok: false, message: `expected ${key}=${String(value)}` };
    }
  }

  return { ok: true, message: "json match passed" };
}

function verifyMazePath(
  worldRoot: string,
  layoutRelative: string,
  answer: string | undefined,
): VerifyResult {
  if (!answer?.trim()) {
    return { ok: false, message: "submit a path string using N,S,E,W (e.g. DDRR)" };
  }
  try {
    const layoutPath = resolveWorldPath(worldRoot, layoutRelative);
    const grid = parseMaze(readFileSync(layoutPath, "utf8"));
    return simulatePath(grid, answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

function verifyMazeAtExit(
  mazeAtExit: ((problemId: string) => boolean) | undefined,
  problemId: string | undefined,
): VerifyResult {
  if (!problemId) {
    return { ok: false, message: "missing problem id" };
  }
  if (!mazeAtExit?.(problemId)) {
    return { ok: false, message: "agent is not standing on exit E for this maze" };
  }
  return { ok: true, message: "reached maze exit" };
}
