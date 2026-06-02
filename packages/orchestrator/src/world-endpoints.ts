import type { WorldEndpoint } from "./types.js";

function toMcpUrl(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  return trimmed.endsWith("/mcp") ? trimmed : `${trimmed}/mcp`;
}

function toStatusUrl(base: string): string {
  const trimmed = base.replace(/\/mcp$/, "").replace(/\/$/, "");
  return `${trimmed}/status`;
}

export function buildWorldEndpoints(worldCount: number, worldUrls?: string): WorldEndpoint[] {
  if (worldUrls) {
    return worldUrls.split(",").map((url, index) => {
      const trimmed = url.trim();
      return {
        id: String(index),
        mcpUrl: toMcpUrl(trimmed),
        statusUrl: toStatusUrl(trimmed),
      };
    });
  }

  return Array.from({ length: worldCount }, (_, i) => ({
    id: String(i),
    mcpUrl: `http://world-${i}:3100/mcp`,
    statusUrl: `http://world-${i}:3100/status`,
  }));
}

export { toMcpUrl, toStatusUrl };
