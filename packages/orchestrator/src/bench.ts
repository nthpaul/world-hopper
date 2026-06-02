import { resolveBenchConfig, printHelp, parseCliArgs } from "./config.js";
import { runBenchmark } from "./slot-loop.js";
import { waitForWorlds } from "./world-client.js";
import { listProblems, listTaskPacks } from "./task-packs.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { listProblems: shouldList, help, overrides } = parseCliArgs(argv);

  if (help) {
    printHelp();
    return;
  }

  if (shouldList) {
    const pack = overrides.taskPack ?? process.env.TASK_PACK ?? "example";
    const packs = listTaskPacks();
    console.log(`Task packs: ${packs.join(", ") || "(none)"}\n`);
    for (const p of packs.length ? packs : [pack]) {
      const problems = listProblems(p);
      console.log(`[${p}] ${problems.length} problems:`);
      for (const prob of problems) {
        console.log(`  - ${prob.id}: ${prob.title}`);
      }
      console.log();
    }
    return;
  }

  const config = resolveBenchConfig(argv);

  const activeProblems = config.problemIds?.length
    ? config.problemIds
    : listProblems(config.taskPack).map((p) => p.id);

  console.log(
    JSON.stringify(
      {
        profile: config.profileName,
        modelId: config.modelId,
        slotMs: config.slotMs,
        benchDurationMs: config.benchDurationMs,
        benchSeed: config.benchSeed,
        taskPack: config.taskPack,
        problems: activeProblems,
        worlds: config.worlds.length,
      },
      null,
      2,
    ),
  );

  await waitForWorlds(config.worlds.map((w) => w.statusUrl));
  await runBenchmark(config);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
