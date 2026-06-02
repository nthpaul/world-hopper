import type { WorldStatusSnapshot } from "./types.js";

export async function fetchWorldStatus(statusUrl: string): Promise<WorldStatusSnapshot> {
  const res = await fetch(statusUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch world status from ${statusUrl}: ${res.status}`);
  }
  return (await res.json()) as WorldStatusSnapshot;
}

export async function waitForWorlds(statusUrls: string[], timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const checks = await Promise.all(
      statusUrls.map(async (url) => {
        try {
          const res = await fetch(url.replace("/status", "/health"));
          return res.ok;
        } catch {
          return false;
        }
      }),
    );
    if (checks.every(Boolean)) return;
    await sleep(500);
  }
  throw new Error("Timed out waiting for world containers");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
