#!/usr/bin/env node
/**
 * Aggregate comparison runs into docs/MODEL_COMPARISON.md and results/comparison-summary.csv
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const resultsDir = join(root, "results");
const logPath = join(resultsDir, "comparison-run-log.jsonl");
const manifestPath = join(root, "configs/model-comparison/manifest.json");
const outMd = join(root, "docs/MODEL_COMPARISON.md");
const outCsv = join(resultsDir, "comparison-summary.csv");

function mean(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdev(nums) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const v = nums.reduce((s, x) => s + (x - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

function fmtPct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function wallMs(data) {
  return new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime();
}

function loadRuns() {
  const byProfile = new Map();

  if (existsSync(logPath)) {
    for (const line of readFileSync(logPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (!row.resultsFile) continue;
      const path = join(resultsDir, row.resultsFile);
      if (!existsSync(path)) continue;
      const data = JSON.parse(readFileSync(path, "utf8"));
      const key = data.config?.profileName ?? row.benchProfile;
      if (!key?.startsWith("compare-")) continue;
      byProfile.set(key, { data, row });
    }
  }

  if (byProfile.size === 0 && existsSync(resultsDir)) {
    for (const f of readdirSync(resultsDir)) {
      if (!f.endsWith(".json") || f === "live.json") continue;
      const data = JSON.parse(readFileSync(join(resultsDir, f), "utf8"));
      const key = data.config?.profileName;
      if (!key?.startsWith("compare-")) continue;
      byProfile.set(key, { data, row: { resultsFile: f } });
    }
  }

  return [...byProfile.values()];
}

const SUITE_NAMES = ["quick", "maze", "full"];

function parseProfileKey(profileName) {
  const m = /^compare-(.+)-s(\d+)$/.exec(profileName);
  if (!m) return null;
  const middle = m[1];
  const seed = Number(m[2]);
  for (const suite of SUITE_NAMES) {
    if (middle.startsWith(`${suite}-`)) {
      return { suite, modelSlug: middle.slice(suite.length + 1), seed };
    }
  }
  return null;
}

function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entries = loadRuns();

  if (!entries.length) {
    console.error("No comparison results found (profileName compare-*). Run npm run compare:models first.");
    process.exit(1);
  }

  const modelBySlug = new Map(
    manifest.models.map((m) => [
      m.id.replace(/^claude-/, "").replace(/\./g, "-"),
      m,
    ]),
  );

  const suites = [...new Set(manifest.suites.map((p) => {
    const name = JSON.parse(readFileSync(join(root, p), "utf8")).name;
    return name ?? p;
  }))];

  /** @type {Map<string, { label: string, id: string, suite: string, runs: object[] }>} */
  const groups = new Map();

  for (const { data, row } of entries) {
    const profileName = data.config?.profileName;
    const parsed = parseProfileKey(profileName);
    if (!parsed) continue;
    const model =
      modelBySlug.get(parsed.modelSlug) ??
      manifest.models.find((m) => data.config?.modelId === m.id);
    if (!model) continue;
    const gkey = `${parsed.suite}\0${model.id}`;
    if (!groups.has(gkey)) {
      groups.set(gkey, {
        suite: parsed.suite,
        label: model.label,
        id: model.id,
        runs: [],
      });
    }
    const slots = data.slots ?? [];
    const agg = data.aggregates ?? {};
    const tasksTotal = agg.tasksTotal ?? data.config?.worldCount ?? 0;
    const tasksSolved = agg.tasksSolved ?? 0;
    const timeouts = slots.filter((s) => s.exitReason === "timeout").length;
    const toolCalls = slots.reduce((n, s) => n + (s.mcpToolCalls ?? 0), 0);

    groups.get(gkey).runs.push({
      seed: parsed.seed,
      profileName,
      resultsFile: row.resultsFile,
      tasksTotal,
      tasksSolved,
      solveRate: tasksTotal > 0 ? tasksSolved / tasksTotal : 0,
      perfect: tasksTotal > 0 && tasksSolved === tasksTotal,
      wallMs: wallMs(data),
      totalSolveDurationMs: agg.totalSolveDurationMs ?? 0,
      timeouts,
      toolCalls,
      slots: slots.length,
    });
  }

  const generatedAt = new Date().toISOString();
  const lines = [];
  lines.push("# Model comparison (World Hop Benchmark)");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push("## Experimental design");
  lines.push("");
  lines.push("- **Harness**: Cursor SDK `Agent` / `Run` with HTTP MCP world tools (not chat-completions).");
  lines.push("- **Suites**: `quick` (3 tasks), `maze` (3 tasks), `full` (8 tasks) — see `configs/*.json`.");
  lines.push(`- **Seeds**: ${manifest.seeds.join(", ")} (3 replicates per model per suite).`);
  lines.push("- **Fairness**: Same seed ⇒ same `WORLD_ASSIGNMENTS` and visit order for all models on that suite.");
  lines.push("");
  lines.push("## Model IDs");
  lines.push("");
  lines.push("| Display name | SDK `MODEL_ID` |");
  lines.push("|--------------|----------------|");
  for (const m of manifest.models) {
    lines.push(`| ${m.label} | \`${m.id}\` |`);
  }
  lines.push("");

  const csvRows = [
    "suite,model_id,model_label,seeds,mean_solve_rate,pass_at_3,mean_wall_ms,mean_solve_duration_ms,mean_tool_calls,total_timeouts",
  ];

  for (const suite of suites) {
    lines.push(`## ${suite}`);
    lines.push("");
    lines.push("| Model | Solve rate (mean ± σ) | Pass@3 | Median wall | Mean solve time | Mean tool calls | Timeouts |");
    lines.push("|-------|----------------------|--------|-------------|-----------------|-----------------|----------|");

    const suiteGroups = [...groups.values()].filter((g) => g.suite === suite);
    suiteGroups.sort((a, b) => a.label.localeCompare(b.label));

    for (const g of suiteGroups) {
      const rates = g.runs.map((r) => r.solveRate);
      const walls = g.runs.map((r) => r.wallMs);
      const solveDur = g.runs.map((r) => r.totalSolveDurationMs);
      const tools = g.runs.map((r) => r.toolCalls);
      const timeouts = g.runs.reduce((n, r) => n + r.timeouts, 0);
      const passAt3 = g.runs.filter((r) => r.perfect).length / g.runs.length;
      const medWall = [...walls].sort((a, b) => a - b)[Math.floor(walls.length / 2)] ?? 0;

      lines.push(
        `| ${g.label} | ${fmtPct(mean(rates))} ± ${(stdev(rates) * 100).toFixed(1)}pp | ${fmtPct(passAt3)} | ${fmtMs(medWall)} | ${fmtMs(mean(solveDur))} | ${mean(tools).toFixed(1)} | ${timeouts} |`,
      );

      csvRows.push(
        [
          suite,
          g.id,
          g.label,
          g.runs.map((r) => r.seed).join("|"),
          mean(rates).toFixed(4),
          passAt3.toFixed(4),
          Math.round(mean(walls)),
          Math.round(mean(solveDur)),
          mean(tools).toFixed(1),
          timeouts,
        ].join(","),
      );
    }
    lines.push("");

    lines.push("### Per-seed detail");
    lines.push("");
    for (const g of suiteGroups) {
      lines.push(`**${g.label}** (\`${g.id}\`)`);
      lines.push("");
      lines.push("| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |");
      lines.push("|------|--------|------|------|-------|----------|--------------|");
      for (const r of [...g.runs].sort((a, b) => a.seed - b.seed)) {
        lines.push(
          `| ${r.seed} | ${r.tasksSolved}/${r.tasksTotal} | ${fmtPct(r.solveRate)} | ${fmtMs(r.wallMs)} | ${r.toolCalls} | ${r.timeouts} | ${r.resultsFile ?? "—"} |`,
        );
      }
      lines.push("");
    }
  }

  lines.push("## Raw artifacts");
  lines.push("");
  lines.push("- Run log: `results/comparison-run-log.jsonl` (local, gitignored)");
  lines.push("- Per-run JSON: `results/*.json` with `config.profileName` prefix `compare-`");
  lines.push("");

  mkdirSync(dirname(outMd), { recursive: true });
  writeFileSync(outMd, lines.join("\n"));
  writeFileSync(outCsv, `${csvRows.join("\n")}\n`);

  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outCsv}`);
}

main();
