import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runVerifier } from "./verifiers.js";
import type { TaskPackManifest } from "./types.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packRoot = join(repoRoot, "task-packs/example");
const worldRoot = mkdtempSync(join(tmpdir(), "world-smoke-"));
cpSync(join(packRoot, "problems"), worldRoot, { recursive: true });

const manifest = JSON.parse(
  readFileSync(join(packRoot, "manifest.json"), "utf8"),
) as TaskPackManifest;

async function main(): Promise<void> {
  const math = manifest.problems.find((p) => p.id === "math-quiz")!;
  const flag = manifest.problems.find((p) => p.id === "find-flag")!;

  const mathResult = await runVerifier(math.verify, {
    worldRoot,
    answer: "42",
  });
  const flagResult = await runVerifier(flag.verify, {
    worldRoot,
    answer: "FLAG{world-hop-benchmark}",
  });

  console.log("math-quiz:", mathResult);
  console.log("find-flag:", flagResult);

  if (!mathResult.ok || !flagResult.ok) process.exit(1);
}

main();
