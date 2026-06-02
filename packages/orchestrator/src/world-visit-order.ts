import type { WorldEndpoint } from "./types.js";
import { createSeededRng } from "./world-picker.js";

/** Offset from benchSeed so visit order is independent of task assignment shuffle. */
export const VISIT_ORDER_SEED_OFFSET = 1;

export function buildWorldVisitOrder(seed: number, worlds: WorldEndpoint[]): WorldEndpoint[] {
  const rng = createSeededRng((seed + VISIT_ORDER_SEED_OFFSET) >>> 0);
  const shuffled = [...worlds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

export function worldVisitOrderIds(order: WorldEndpoint[]): string[] {
  return order.map((world) => world.id);
}
