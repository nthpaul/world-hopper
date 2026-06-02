import express from "express";
import { createWorldRuntime, handleMcpRequest } from "./mcp-server.js";

const port = Number(process.env.PORT ?? 3100);
const worldId = process.env.WORLD_ID ?? "0";
const taskPackPath = process.env.TASK_PACK_PATH ?? "/task-packs/example";
const worldRoot = process.env.WORLD_ROOT ?? "/world";

const runtime = createWorldRuntime(taskPackPath, worldId, worldRoot);
const app = express();

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, worldId: runtime.worldId });
});

app.get("/status", (_req, res) => {
  res.json(runtime.status());
});

app.post("/mcp", async (req, res) => {
  console.log(`[world-${worldId}] MCP ${req.method} ${req.headers["mcp-session-id"] ?? "new-session"}`);
  try {
    await handleMcpRequest(runtime, req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

app.listen(port, "0.0.0.0", () => {
  const ids = runtime.pack.activeProblemIds.join(", ") || "(none)";
  console.log(
    `world-${worldId} listening on :${port} pack=${runtime.pack.manifest.packId} problems=[${ids}]`,
  );
});
