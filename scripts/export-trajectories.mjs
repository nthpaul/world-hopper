#!/usr/bin/env node
/**
 * Export bench slot trajectories as JSONL for RL datasets / replay.
 * Usage: node scripts/export-trajectories.mjs <results.json> [--out path.jsonl]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

function parseArgs(argv) {
  const positional = [];
  let outPath;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      outPath = argv[++i];
      continue;
    }
    if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
    positional.push(arg);
  }

  if (positional.length !== 1) {
    console.error("Usage: node scripts/export-trajectories.mjs <results.json> [--out path.jsonl]");
    process.exit(1);
  }

  return { resultsPath: resolve(positional[0]), outPath };
}

function defaultOutPath(resultsPath) {
  const ext = extname(resultsPath);
  if (ext) return resultsPath.slice(0, -ext.length) + ".jsonl";
  return `${resultsPath}.jsonl`;
}

function benchRunId(results) {
  const name = results.runName ?? "bench";
  return `${name}__${results.startedAt}`;
}

function mapActivityEvent(event) {
  switch (event.kind) {
    case "tool":
      return {
        type: "tool",
        label: event.label,
        detail: event.detail,
        ok: event.ok,
      };
    case "assistant":
    case "thinking":
      return {
        type: "text",
        label: event.label,
        detail: event.detail,
      };
    case "world":
      return {
        type: "observation",
        label: event.label,
        detail: event.detail,
        ok: event.ok,
      };
    default:
      return {
        type: event.kind,
        label: event.label,
        detail: event.detail,
        ok: event.ok,
      };
  }
}

function slotToTrajectory(results, slot) {
  const assignments = results.config?.worldAssignments ?? {};
  const problemId = assignments[slot.worldId] ?? slot.lastProblemId;
  const reward = slot.exitReason === "solved" ? 1 : 0;

  return {
    runId: benchRunId(results),
    agentId: results.agentId,
    modelId: results.config?.modelId,
    benchSeed: results.config?.benchSeed,
    slotIndex: slot.slotIndex,
    worldId: slot.worldId,
    problemId,
    reward,
    done: true,
    exitReason: slot.exitReason,
    actions: (slot.activity ?? []).map(mapActivityEvent),
    metadata: {
      startedAt: slot.startedAt,
      endedAt: slot.endedAt,
      mcpToolCalls: slot.mcpToolCalls ?? 0,
      solveDurationMs: slot.solveDurationMs,
    },
  };
}

function exportTrajectories(resultsPath, outPath) {
  if (!existsSync(resultsPath)) {
    console.error(`Results file not found: ${resultsPath}`);
    process.exit(1);
  }

  const results = JSON.parse(readFileSync(resultsPath, "utf8"));
  const slots = results.slots ?? [];
  const lines = slots.map((slot) => JSON.stringify(slotToTrajectory(results, slot)));
  const payload = lines.length ? `${lines.join("\n")}\n` : "";

  writeFileSync(outPath, payload, "utf8");
  return { slotCount: slots.length, outPath };
}

const { resultsPath, outPath: outArg } = parseArgs(process.argv);
const outPath = outArg ? resolve(outArg) : defaultOutPath(resultsPath);
const { slotCount } = exportTrajectories(resultsPath, outPath);

console.log(`Exported ${slotCount} slot trajectory(ies) to ${outPath}`);
