export function minBenchDurationMs(slotMs: number, worldCount: number): number {
  return slotMs * worldCount;
}

export function formatMinBenchDurationMessage(minSec: number): string {
  return `Set max bench time to at least ${minSec} seconds.`;
}

export function validateBenchDuration(
  slotMs: number,
  benchDurationMs: number,
  worldCount: number,
): void {
  const minMs = minBenchDurationMs(slotMs, worldCount);
  if (benchDurationMs >= minMs) return;

  throw new Error(formatMinBenchDurationMessage(Math.ceil(minMs / 1000)));
}
