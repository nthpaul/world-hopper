import { createWorldRuntime } from "./mcp-server.js";
import { runVerifier } from "./verifiers.js";

const runtime = createWorldRuntime("task-packs/example", "smoke", "/tmp/world-smoke");

async function main(): Promise<void> {
  const math = runtime.pack.problems.get("math-quiz")!;
  const flag = runtime.pack.problems.get("find-flag")!;

  const mathResult = await runVerifier(math.verify, {
    worldRoot: runtime.pack.worldRoot,
    answer: "42",
  });
  const flagResult = await runVerifier(flag.verify, {
    worldRoot: runtime.pack.worldRoot,
    answer: "FLAG{world-hop-bench}",
  });

  console.log("math-quiz:", mathResult);
  console.log("find-flag:", flagResult);
  console.log("status:", runtime.status());

  if (!mathResult.ok || !flagResult.ok) process.exit(1);
}

main();
