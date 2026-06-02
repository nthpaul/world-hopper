/**
 * Shared world→task assignment helpers (plain JS for scripts).
 */

export function validateWorldTaskCount(worldCount, problemCount) {
  if (worldCount !== problemCount) {
    throw new Error(
      `World count must equal task count (${worldCount} worlds, ${problemCount} tasks selected)`,
    );
  }
}

export function createSeededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function buildWorldAssignments({ seed, worldCount, problemIds }) {
  validateWorldTaskCount(worldCount, problemIds.length);
  const rng = createSeededRng(seed);
  const shuffled = [...problemIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const assignments = {};
  for (let worldId = 0; worldId < worldCount; worldId++) {
    assignments[worldId] = shuffled[worldId];
  }
  return assignments;
}

export function formatWorldAssignments(assignments) {
  return Object.entries(assignments)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([worldId, problemId]) => `${worldId}:${problemId}`)
    .join(",");
}

export function resolveProblemIds(profile, root, readFileSync, existsSync, join) {
  if (profile.problems?.length) return profile.problems;
  const packId = profile.taskPack ?? "example";
  const manifestPath = join(root, "task-packs", packId, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Task pack not found: ${packId}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return manifest.problems.map((p) => p.id);
}
