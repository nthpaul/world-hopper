import { Agent, CursorAgentError, type Run } from "@cursor/sdk";
import { basename } from "node:path";
import { buildSlotPrompt, createSeededRng, pickRandomWorld } from "./world-picker.js";
import { fetchWorldStatus, sleep } from "./world-client.js";
import {
  buildAggregates,
  buildResultsConfig,
  mergeWorldSnapshots,
  publishLiveResults,
  writeResults,
} from "./results.js";
import type { BenchConfig, BenchResults, SlotRecord } from "./types.js";
import { debugLog } from "./debug-log.js";
import { listProblems } from "./task-packs.js";
import { buildRunName } from "./run-name.js";

async function cancelRun(run: Run | undefined): Promise<{ status?: string; runId?: string }> {
  if (!run) return {};
  try {
    if (run.supports("cancel")) {
      await run.cancel();
    }
    const result = await run.wait();
    return { status: result.status, runId: result.id };
  } catch {
    return {};
  }
}

async function consumeRunStream(run: Run): Promise<{
  chars: number;
  mcpToolCalls: number;
  toolNames: string[];
}> {
  let chars = 0;
  let mcpToolCalls = 0;
  const toolNames: string[] = [];
  try {
    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") chars += block.text.length;
        }
      }
      if (event.type === "tool_call") {
        mcpToolCalls += 1;
        toolNames.push(event.name);
        debugLog("slot-loop.ts:tool_call", "tool call event", "H4-fix", {
          name: event.name,
          status: event.status,
        });
      }
    }
  } catch {
    // stream may abort on cancel
  }
  return { chars, mcpToolCalls, toolNames };
}

export async function runBenchmark(config: BenchConfig): Promise<BenchResults> {
  const startedAt = new Date().toISOString();
  const runName = buildRunName(config);
  const rng = createSeededRng(config.benchSeed);
  const slots: SlotRecord[] = [];
  let aggregates = buildAggregates(slots);
  let agentId = "";

  publishLiveResults(config.resultsDir, {
    status: "starting",
    startedAt,
    endedAt: startedAt,
    config,
    runName,
    agentId,
    slots,
    aggregates,
  });

  await Promise.all(
    config.worlds.map((w) =>
      fetchWorldStatus(w.statusUrl).then((s) => {
        /* baseline fetch only */
        void s;
      }),
    ),
  );

  let currentRun: Run | undefined;
  let streamTask: Promise<{ chars: number; mcpToolCalls: number; toolNames: string[] }> | undefined;

  try {
    await using agent = await Agent.create({
      apiKey: config.apiKey,
      model: { id: config.modelId },
      local: {
        cwd: config.agentStubCwd,
        settingSources: ["project"],
        ...(config.sandboxEnabled ? { sandboxOptions: { enabled: true } } : {}),
      },
    });

    agentId = agent.agentId;
    publishLiveResults(config.resultsDir, {
      status: "running",
      startedAt,
      endedAt: new Date().toISOString(),
      config,
      runName,
      agentId,
      slots,
      aggregates,
    });

    const activeProblems =
      config.problemIds ?? listProblems(config.taskPack).map((p) => p.id);
    const benchDeadline = Date.now() + config.benchDurationMs;
    let slotIndex = 0;

    while (Date.now() < benchDeadline) {
      const world = pickRandomWorld(config.worlds, rng);
      const slotStarted = new Date();

      publishLiveResults(config.resultsDir, {
        status: "running",
        startedAt,
        endedAt: new Date().toISOString(),
        config,
        runName,
        agentId,
        slots,
        aggregates,
        currentSlot: {
          slotIndex,
          worldId: world.id,
          startedAt: slotStarted.toISOString(),
        },
      });

      if (currentRun) {
        await cancelRun(currentRun);
        if (streamTask) await streamTask;
      }

      const before = await fetchWorldStatus(world.statusUrl);

      console.log(`[slot ${slotIndex}] connected to world-${world.id} (${config.slotMs}ms)`);

      const prompt = buildSlotPrompt(
        world,
        config.slotMs,
        slotIndex,
        activeProblems,
      );
      currentRun = await agent.send(prompt, {
        mcpServers: {
          world: {
            type: "http",
            url: world.mcpUrl,
          },
        },
      });

      streamTask = consumeRunStream(currentRun);
      const slotDeadline = Date.now() + config.slotMs;
      while (Date.now() < slotDeadline) {
        await sleep(Math.min(250, slotDeadline - Date.now()));
      }

      const cancelInfo = await cancelRun(currentRun);
      const streamResult = (await streamTask) ?? { chars: 0, mcpToolCalls: 0, toolNames: [] };
      const after = await fetchWorldStatus(world.statusUrl);

      const submitCalls = streamResult.toolNames.filter((n) => /submit/i.test(n));
      debugLog("slot-loop.ts:slot-end", "slot completed", "H1,H3,H4", {
        slotIndex,
        worldId: world.id,
        solvedBefore: before.solvedCount,
        solvedAfter: after.solvedCount,
        solvedBeforeIds: before.solvedIds,
        solvedAfterIds: after.solvedIds,
        mcpToolCalls: streamResult.mcpToolCalls,
        toolNames: streamResult.toolNames.slice(0, 20),
        submitCallCount: submitCalls.length,
        runStatus: cancelInfo.status,
      });
      console.log(
        `[slot ${slotIndex}] done world-${world.id} delta=${after.solvedCount - before.solvedCount} tools=${streamResult.mcpToolCalls} submit=${submitCalls.length}`,
      );

      const slotEnded = new Date();
      slots.push({
        slotIndex,
        worldId: world.id,
        startedAt: slotStarted.toISOString(),
        endedAt: slotEnded.toISOString(),
        solvedBefore: before.solvedCount,
        solvedAfter: after.solvedCount,
        solvedDelta: after.solvedCount - before.solvedCount,
        runId: cancelInfo.runId,
        runStatus: cancelInfo.status,
        assistantChars: streamResult.chars,
        mcpToolCalls: streamResult.mcpToolCalls,
      });

      aggregates = buildAggregates(slots);
      mergeWorldSnapshots(aggregates, world.id, after.solvedIds);
      publishLiveResults(config.resultsDir, {
        status: "running",
        startedAt,
        endedAt: slotEnded.toISOString(),
        config,
        runName,
        agentId,
        slots,
        aggregates,
      });

      slotIndex += 1;
      currentRun = undefined;
      streamTask = undefined;
    }
  } catch (err) {
    const message =
      err instanceof CursorAgentError
        ? `Agent startup failed: ${err.message} (retryable=${err.isRetryable})`
        : err instanceof Error
          ? err.message
          : String(err);
    publishLiveResults(config.resultsDir, {
      status: "failed",
      startedAt,
      endedAt: new Date().toISOString(),
      config,
      runName,
      agentId,
      slots,
      aggregates,
      error: message,
    });
    throw err instanceof CursorAgentError ? new Error(message) : err;
  }

  const endedAt = new Date().toISOString();
  aggregates = buildAggregates(slots);

  const finalStatuses = await Promise.all(
    config.worlds.map(async (w) => ({ worldId: w.id, status: await fetchWorldStatus(w.statusUrl) })),
  );
  for (const { worldId, status } of finalStatuses) {
    aggregates.uniqueSolvedByWorld[worldId] = status.solvedIds;
  }

  const results: BenchResults = {
    runName,
    startedAt,
    endedAt,
    config: buildResultsConfig(config),
    agentId,
    slots,
    aggregates,
  };

  const path = writeResults(config.resultsDir, results);
  publishLiveResults(config.resultsDir, {
    status: "complete",
    startedAt,
    endedAt,
    config,
    runName,
    agentId,
    slots,
    aggregates,
    resultsFile: basename(path),
  });
  console.log(`Benchmark complete. ${runName} → ${path}`);
  console.log(
    JSON.stringify(
      {
        slots: slots.length,
        totalSolvedDelta: aggregates.totalSolvedDelta,
        perWorld: aggregates.uniqueSolvedByWorld,
      },
      null,
      2,
    ),
  );

  return results;
}
