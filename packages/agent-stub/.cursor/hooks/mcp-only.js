#!/usr/bin/env node
const fs = require("node:fs");

const LOCAL_TOOLS = new Set([
  "shell",
  "read",
  "write",
  "edit",
  "grep",
  "glob",
  "ls",
  "semsearch",
  "task",
  "delete",
]);

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}

const toolName = String(
  input.tool_name ?? input.toolName ?? input.name ?? input.tool ?? "",
).toLowerCase();

console.error(`[hook] preToolUse tool=${toolName}`);

if (LOCAL_TOOLS.has(toolName)) {
  process.stdout.write(
    JSON.stringify({
      permission: "deny",
      agent_message:
        "Local tools disabled. Use world MCP: list_problems, get_problem, read_file, write_file, submit.",
    }),
  );
  process.exit(0);
}

process.stdout.write(JSON.stringify({ permission: "allow" }));
process.exit(0);
