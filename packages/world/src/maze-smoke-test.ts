import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMaze, simulatePath, tryMove } from "./maze.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packRoot = join(repoRoot, "task-packs/maze");
const worldRoot = mkdtempSync(join(tmpdir(), "maze-smoke-"));
cpSync(join(packRoot, "problems"), worldRoot, { recursive: true });

async function main(): Promise<void> {
  const easyLayout = readFileSync(
    join(worldRoot, "maze/easy/layout.txt"),
    "utf8",
  );
  const easy = parseMaze(easyLayout);
  const easyPath = simulatePath(easy, "DDRR");
  console.log("maze-easy path:", easyPath);

  const mediumLayout = readFileSync(
    join(worldRoot, "maze/medium/layout.txt"),
    "utf8",
  );
  const medium = parseMaze(mediumLayout);
  const mediumPath = simulatePath(medium, "SSEESSSEE");
  console.log("maze-medium path (SSEESSSEE):", mediumPath);

  const walk = parseMaze(
    readFileSync(join(worldRoot, "maze/walk/layout.txt"), "utf8"),
  );
  let pos = { ...walk.start };
  for (const d of "DDRR") {
    const step = tryMove(walk, pos, d);
    if (!step.ok) throw new Error(`walk failed on ${d}`);
    pos = step.pos;
  }
  console.log("maze-walk at exit:", pos.x === walk.exit.x && pos.y === walk.exit.y);

  if (!easyPath.ok) process.exit(1);
}

main();
