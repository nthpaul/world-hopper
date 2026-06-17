import { chmodSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runVerifier } from "./verifiers.js";
import type { TaskPackManifest } from "./types.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packRoot = join(repoRoot, "task-packs/computer-use");
const worldRoot = mkdtempSync(join(tmpdir(), "cu-smoke-"));
cpSync(join(packRoot, "problems"), worldRoot, { recursive: true });

const manifest = JSON.parse(
  readFileSync(join(packRoot, "manifest.json"), "utf8"),
) as TaskPackManifest;

writeFileSync(join(worldRoot, "service/config.yaml"), "port: 8080\nhost: localhost\n");
chmodSync(join(worldRoot, "scripts/deploy.sh"), 0o755);
writeFileSync(join(worldRoot, "env/.env"), "SERVICE_TOKEN=bench-ready\n");
writeFileSync(
  join(worldRoot, "support/ticket.txt"),
  "customerId: C-1042\nname: Jane Doe\nemail: jane@example.com\nissue: Cannot access dashboard after password reset\n",
);
writeFileSync(join(worldRoot, "compliance/ack.txt"), "ACK: data-retention-v2\n");

const answers: Record<string, string> = { "csv-total": "255.5" };

async function main(): Promise<void> {
  let failed = false;
  for (const problem of manifest.problems) {
    const result = await runVerifier(problem.verify, {
      worldRoot,
      answer: answers[problem.id],
    });
    console.log(`${problem.id}:`, result.ok ? "PASS" : "FAIL", result.message);
    if (!result.ok) failed = true;
  }
  if (failed) process.exit(1);
}

main();
