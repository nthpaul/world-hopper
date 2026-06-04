import { Agent, CursorAgentError, type Run } from "@cursor/sdk";
import { basename } from "node:path";
import { buildSlotPrompt } from "./world-picker.js";
import { getAssignedProblemId } from "./world-assignments.js";
import { fetchWorldStatus, sleep } from "./world-client.js";
import {
  buildAggregates,
  rebuildAggregates,
  buildResultsConfig,
  mergeWorldSnapshots,
  publishLiveResults,
  reconcileTasksSolved,
  writeResults,
} from "./results.js";
import type { BenchConfig, BenchResults, LiveCurrentSlot, SlotRecord, WorldEndpoint, WorldStatusSnapshot } from "./types.js";
import { debugLog } from "./debug-log.js";
import { buildRunName } from "./run-name.js";
import { consumeRunStreamWithLive, LiveSlotTracker } from "./live-activity.js";

const LIVE_PUBLISH_MS = 400;
const WORLD_POLL_MS = 800;

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

function buildCurrentSlot(
  slotIndex: number,
  worldId: string,
  startedAt: string,
  tracker: LiveSlotTracker,
): LiveCurrentSlot {
  const summary = tracker.summary();
  return {
    slotIndex,
    worldId,
    startedAt,
    activity: tracker.snapshot(),
    maze: summary.maze,
  };
}

function isAssignedTaskSolved(
  assignedProblemId: string,
  beforeIds: string[],
  status: WorldStatusSnapshot | undefined,
  tracker: LiveSlotTracker,
): boolean {
  if (
    status?.solvedIds.includes(assignedProblemId) &&
    !beforeIds.includes(assignedProblemId)
  ) {
    return true;
  }
  const summary = tracker.summary();
  return summary.lastSuccessfulSubmit?.problemId === assignedProblemId;
}

function resolveVisitOrder(config: BenchConfig): WorldEndpoint[] {
  const worldById = new Map(config.worlds.map((world) => [world.id, world]));
  return config.worldVisitOrder.map((worldId) => {
    const world = worldById.get(worldId);
    if (!world) {
      throw new Error(`Unknown world id in visit order: ${worldId}`);
    }
    return world;
  });
}

export async function runBenchmark(config: BenchConfig): Promise<BenchResults> {
  const startedAt = new Date().toISOString();
  const runName = buildRunName(config);
  const tasksTotal = config.worlds.length;
  const visitOrder = resolveVisitOrder(config);
  const slots: SlotRecord[] = [];
  let aggregates = buildAggregates(slots, tasksTotal);
  let agentId = "";

  console.log(
    `[bench] visit order: ${visitOrder.map((world) => `world-${world.id}`).join(" → ")}`,
  );

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
        void s;
      }),
    ),
  );

  let currentRun: Run | undefined;
  let streamTask:
    | Promise<ReturnType<LiveSlotTracker["summary"]>>
    | undefined;
  let slotTracker: LiveSlotTracker | undefined;

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

    const benchDeadline = Date.now() + config.benchDurationMs;

    for (let slotIndex = 0; slotIndex < visitOrder.length; slotIndex++) {
      if (Date.now() >= benchDeadline) {
        console.log(
          `[bench] stopped at slot ${slotIndex}/${visitOrder.length}: max bench time reached`,
        );
        break;
      }

      const world = visitOrder[slotIndex]!;
      const slotStarted = new Date();
      slotTracker = new LiveSlotTracker();

      publishLiveResults(config.resultsDir, {
        status: "running",
        startedAt,
        endedAt: new Date().toISOString(),
        config,
        runName,
        agentId,
        slots,
        aggregates,
        currentSlot: buildCurrentSlot(
          slotIndex,
          world.id,
          slotStarted.toISOString(),
          slotTracker,
        ),
      });

      if (currentRun) {
        await cancelRun(currentRun);
        if (streamTask) await streamTask;
      }

      const before = await fetchWorldStatus(world.statusUrl);

      const assignedProblemId = getAssignedProblemId(config.worldAssignments, world.id);

      console.log(
        `[slot ${slotIndex}] connected to world-${world.id} task=${assignedProblemId} (${config.slotMs}ms)`,
      );

      const prompt = buildSlotPrompt(
        world,
        config.slotMs,
        slotIndex,
        assignedProblemId,
      );
      currentRun = await agent.send(prompt, {
        mcpServers: {
          world: {
            type: "http",
            url: world.mcpUrl,
          },
        },
      });

      let lastPublish = 0;
      const publishSlotLive = (force = false) => {
        if (!slotTracker) return;
        const now = Date.now();
        if (!force && now - lastPublish < LIVE_PUBLISH_MS) return;
        lastPublish = now;
        publishLiveResults(config.resultsDir, {
          status: "running",
          startedAt,
          endedAt: new Date().toISOString(),
          config,
          runName,
          agentId,
          slots,
          aggregates,
          currentSlot: buildCurrentSlot(
            slotIndex,
            world.id,
            slotStarted.toISOString(),
            slotTracker,
          ),
        });
      };

      streamTask = consumeRunStreamWithLive(currentRun, slotTracker, () => publishSlotLive());

      const slotDeadline = Date.now() + config.slotMs;
      let lastWorldPoll = 0;
      let lastPolledStatus: WorldStatusSnapshot | undefined;
      let slotExitReason: "solved" | "timeout" = "timeout";

      while (Date.now() < slotDeadline) {
        const now = Date.now();
        if (now - lastWorldPoll >= WORLD_POLL_MS) {
          lastWorldPoll = now;
          try {
            lastPolledStatus = await fetchWorldStatus(world.statusUrl);
            slotTracker.mergeWorldMazes(lastPolledStatus);
            publishSlotLive(true);
          } catch {
            /* ignore transient world poll errors */
          }
        }

        if (
          isAssignedTaskSolved(
            assignedProblemId,
            before.solvedIds,
            lastPolledStatus,
            slotTracker,
          )
        ) {
          slotExitReason = "solved";
          break;
        }

        await sleep(Math.min(250, slotDeadline - Date.now()));
      }

      const cancelInfo = await cancelRun(currentRun);
      const streamResult =
        (await streamTask) ?? slotTracker.summary();
      const after = await fetchWorldStatus(world.statusUrl);
      slotTracker.mergeWorldMazes(after);

      if (
        slotExitReason !== "solved" &&
        isAssignedTaskSolved(assignedProblemId, before.solvedIds, after, slotTracker)
      ) {
        slotExitReason = "solved";
      }

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
        activityCount: streamResult.activityCount,
        lastProblemId: streamResult.lastProblemId,
        exitReason: slotExitReason,
      });

      const slotEnded = new Date();
      const solveDurationMs = slotEnded.getTime() - slotStarted.getTime();
      const solvedEarly = slotExitReason === "solved";

      console.log(
        solvedEarly
          ? `[slot ${slotIndex}] solved early in ${(solveDurationMs / 1000).toFixed(1)}s (cap ${config.slotMs / 1000}s) world-${world.id}`
          : `[slot ${slotIndex}] done world-${world.id} delta=${after.solvedCount - before.solvedCount} tools=${streamResult.mcpToolCalls} submit=${submitCalls.length}`,
      );

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
        activityCount: streamResult.activityCount,
        lastProblemId: streamResult.lastProblemId,
        maze: streamResult.maze,
        exitReason: slotExitReason,
        solveDurationMs,
      });

      aggregates = rebuildAggregates(slots, tasksTotal, aggregates.uniqueSolvedByWorld);
      mergeWorldSnapshots(aggregates, world.id, after.solvedIds);
      reconcileTasksSolved(aggregates, config.worldAssignments);
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

      currentRun = undefined;
      streamTask = undefined;
      slotTracker = undefined;
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
  aggregates = buildAggregates(slots, tasksTotal);

  const finalStatuses = await Promise.all(
    config.worlds.map(async (w) => ({ worldId: w.id, status: await fetchWorldStatus(w.statusUrl) })),
  );
  for (const { worldId, status } of finalStatuses) {
    aggregates.uniqueSolvedByWorld[worldId] = status.solvedIds;
  }
  reconcileTasksSolved(aggregates, config.worldAssignments);

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
        tasksSolved: aggregates.tasksSolved,
        tasksTotal: aggregates.tasksTotal,
        solveRate: aggregates.solveRate,
        totalSolveDurationMs: aggregates.totalSolveDurationMs,
        perWorld: aggregates.uniqueSolvedByWorld,
      },
      null,
      2,
    ),
  );

  return results;
}
