import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getBenchStatus, initBenchRunner, startBench, stopBench, type BenchStartRequest } from "./bench-runner.js";
import { loadMeta, loadDotEnv } from "./meta.js";
import { labelForResults } from "./run-name.js";
import { listSelectableModels } from "./models.js";

const LIVE_FILENAME = "live.json";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function createApiHandler(root: string) {
  initBenchRunner(root);
  const resultsDir = path.join(root, "results");

  return async function handleApi(
    req: IncomingMessage,
    res: ServerResponse,
    url: string,
  ): Promise<boolean> {
    if (url === "/api/meta" && req.method === "GET") {
      sendJson(res, 200, loadMeta(root));
      return true;
    }

    if (url === "/api/models" && req.method === "GET") {
      const dotenv = loadDotEnv(root);
      const models = await listSelectableModels(dotenv.CURSOR_API_KEY);
      sendJson(res, 200, { models });
      return true;
    }

    if (url === "/api/bench/status" && req.method === "GET") {
      sendJson(res, 200, getBenchStatus());
      return true;
    }

    if (url === "/api/bench/start" && req.method === "POST") {
      try {
        const body = JSON.parse(await readBody(req)) as BenchStartRequest;
        const result = startBench(body);
        if (!result.ok) {
          sendJson(res, 400, result);
          return true;
        }
        sendJson(res, 200, { ok: true, status: getBenchStatus() });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: String(err) });
      }
      return true;
    }

    if (url === "/api/bench/stop" && req.method === "POST") {
      const result = stopBench();
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    if (url.startsWith("/api/runs/") && url.length > "/api/runs/".length) {
      const name = decodeURIComponent(url.slice("/api/runs/".length));
      if (!name || name.includes("..") || !name.endsWith(".json")) {
        return false;
      }
      const filePath = path.join(resultsDir, name);
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        res.end("not found");
        return true;
      }
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", name === LIVE_FILENAME ? "no-store" : "public, max-age=5");
      res.end(fs.readFileSync(filePath, "utf8"));
      return true;
    }

    if (url === "/api/runs" || url === "/api/runs/") {
      try {
        if (!fs.existsSync(resultsDir)) {
          sendJson(res, 200, []);
          return true;
        }
        const files = fs
          .readdirSync(resultsDir)
          .filter((f) => f.endsWith(".json") && f !== LIVE_FILENAME)
          .sort()
          .reverse();
        const runs = files.map((file) => {
          try {
            const data = JSON.parse(
              fs.readFileSync(path.join(resultsDir, file), "utf8"),
            ) as { runName?: string; config?: { modelId: string; benchDurationMs: number; slotMs: number; profileName?: string; taskPack?: string } };
            return { file, label: labelForResults(data, file) };
          } catch {
            return { file, label: file.replace(/\.json$/, "") };
          }
        });
        sendJson(res, 200, runs);
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return true;
    }

    return false;
  };
}
