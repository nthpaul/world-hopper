import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SESSION_ID = "afd95d";
const INGEST =
  "http://127.0.0.1:7377/ingest/9ae41620-400a-4694-a8f1-f2c61046af2c";
const LOG_PATH =
  process.env.DEBUG_LOG_PATH ??
  "/Users/ple/Projects/cursor-world-hop-bench/.cursor/debug-afd95d.log";

export function debugLog(
  location: string,
  message: string,
  hypothesisId: string,
  data: Record<string, unknown> = {},
): void {
  const payload = {
    sessionId: SESSION_ID,
    location,
    message,
    hypothesisId,
    data,
    timestamp: Date.now(),
  };

  // #region agent log
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore */
  }
  fetch(INGEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  fetch(INGEST.replace("127.0.0.1", "host.docker.internal"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}
