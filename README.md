# World Hop Benchmark

Eval-style harness: one durable Cursor SDK agent visits each isolated Docker **world** container once (seeded order), solving pluggable task-pack problems via HTTP MCP.

Completed run — tasks solved, world timeline, and per-slot metrics

*Example: `configs/quick.json` via comparison sweep — Composer 2.5, 3/3 tasks, ~12s wall time.*

## Architecture

- **Agent container** — orchestrator + `@cursor/sdk` local agent (stub `cwd`, real work via MCP)
- **World containers** (`world-0` … `world-N`) — each hosts **one unique task** for the run
- **Task packs** — pluggable JSON manifests under `task-packs/`

### Cursor Agent SDK, not chat completion

This benchmark does **not** call a raw chat-completions API or maintain its own `messages[]` tool loop. The orchestrator uses `**@cursor/sdk`’s `Agent` harness**:

1. `**Agent.create`** — one durable agent for the whole run (local `cwd` = `[packages/agent-stub](packages/agent-stub)`; tasks are not solved in that tree).
2. `**agent.send(prompt, { mcpServers })`** — each world visit starts a new SDK `**Run**` with the `world` HTTP MCP server attached for that slot only.
3. `**run.stream()**` — the harness drives the model/tool loop; the orchestrator only consumes events (assistant text, thinking, MCP tool calls) for the live viewer and metrics.
4. `**run.cancel()**` — when a task is solved early or the slot times out, the orchestrator stops the run; SDK status may read `cancelled` even when the bench records `exitReason: solved`.

Work happens in world containers via MCP (`get_problem`, `read_file`, `submit`, maze `move`, etc.). Cursor hooks in the stub workspace **deny** local `read`/`write`/`shell` tools so the agent is pushed toward world MCP only (see `[packages/agent-stub/.cursor/hooks/mcp-only.js](packages/agent-stub/.cursor/hooks/mcp-only.js)`).

That is the same **programmatic agent runtime** Cursor exposes for SDK/CLI agents—not the IDE chat panel, and not a hand-rolled OpenAI-style completion client. Scoring still comes from each world’s HTTP `/status`, not from parsing the model’s final message.

At bench start, selected tasks are shuffled (seeded) and assigned 1:1 to worlds via `WORLD_ASSIGNMENTS`. The agent visits **each world exactly once** in a seeded visit order (`worldVisitOrder`). It **cannot choose tasks** — it must solve whichever task is assigned to the world it lands on. `**worldCount` must equal the number of selected tasks**.

Each slot ends as soon as the assigned task is successfully submitted (`slotMs` is a per-slot timeout cap). `**benchDurationMs`** is the total wall-clock cap and must be at least `**slotMs × worldCount`** so every world can be visited if each slot uses its full timeout. Runs still end early when tasks are solved quickly; partial coverage only occurs if the agent is slow within individual slot caps.

## Prerequisites

- Node 20+
- Docker Compose v2
- `CURSOR_API_KEY` with SDK access

## Quick start (Docker)

Copy the example env file and add your key:

```bash
cp .env.example .env   # edit CURSOR_API_KEY
npm install
docker compose build
npm run compose:bench -- configs/quick.json
```

Or use the viewer (`npm run viewer`) to configure and start runs — it computes `WORLD_ASSIGNMENTS` automatically.

Or export the key directly (`.env` is gitignored):

```bash
export CURSOR_API_KEY=cursor_...
npm run compose:bench -- configs/quick.json
```

Results land in `./results/<timestamp>.json`.

### Multi-model comparison

36-run sweep (4 models × 3 suites × 3 seeds `42` / `43` / `44`). Same seed ⇒ same world→task assignments for every model on that suite. Per-run JSON and slot detail: [docs/MODEL_COMPARISON.md](docs/MODEL_COMPARISON.md) (2026-06-03).

**Suites are separate benchmarks** — `full` does **not** include maze tasks.


| Suite     | Config                                     | Task pack                | What the agent does                                                |
| --------- | ------------------------------------------ | ------------------------ | ------------------------------------------------------------------ |
| **quick** | `[configs/quick.json](configs/quick.json)` | `example` (3 of 8 tasks) | File/shell puzzles: `math-quiz`, `find-flag`, `sum-numbers`        |
| **maze**  | `[configs/maze.json](configs/maze.json)`   | `maze` (3 tasks)         | See maze breakdown below — **not** the same problems as quick/full |
| **full**  | `[configs/full.json](configs/full.json)`   | `example` (all 8 tasks)  | Full example pack; still no maze                                   |


**How to read the results table**

- **Avg solve rate** — mean of (tasks solved ÷ tasks in run) across the 3 seeds. Example: `2/3` on every maze seed ⇒ 67%.
- **Median wall time** — median bench clock time (`endedAt − startedAt`) across the 3 seeds.
- **Flawless on all 3 seeds** — `3/3` runs where every assigned task was solved (none of the three seeds had a miss).


| Suite | Model        | Avg solve rate | Median wall | Flawless on all 3 seeds | What failed (from run logs)                                 |
| ----- | ------------ | -------------- | ----------- | ----------------------- | ----------------------------------------------------------- |
| quick | Composer 2.5 | 100%           | **11.8s**   | Yes (3/3)               | —                                                           |
| quick | GPT 5.5      | 100%           | 32.8s       | Yes (3/3)               | —                                                           |
| quick | Opus 4.7     | 100%           | 24.6s       | Yes (3/3)               | —                                                           |
| quick | Opus 4.8     | 100%           | 34.0s       | Yes (3/3)               | —                                                           |
| maze  | Composer 2.5 | 67%            | **32.0s**   | No (0/3)                | `**maze-medium` every seed** (2/3); path-submit task        |
| maze  | GPT 5.5      | 100%           | 49.3s       | Yes (3/3)               | —                                                           |
| maze  | Opus 4.7     | 89%            | 53.4s       | No (1/3)                | `**maze-walk` on seed 42** (slot timeout); interactive task |
| maze  | Opus 4.8     | 78%            | 61.3s       | No (1/3)                | `**maze-walk` on seeds 42 & 43** (timeouts)                 |
| full  | Composer 2.5 | 100%           | **38.6s**   | Yes (3/3)               | —                                                           |
| full  | GPT 5.5      | 100%           | 93.8s       | Yes (3/3)               | —                                                           |
| full  | Opus 4.7     | 96%            | 95.9s       | No (2/3)                | One task missed on **seed 42 only** (7/8)                   |
| full  | Opus 4.8     | 96%            | 96.0s       | No (2/3)                | One task missed on **seed 42 only** (7/8)                   |


**Maze task styles** (why failures cluster differently):


| Task          | Style                          | Agent workflow                                                                                             |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `maze-easy`   | Path in one shot               | Read layout → `submit(..., answer='NSEW…')` — verifier replays the whole path                              |
| `maze-medium` | Path in one shot (larger grid) | Same as easy; Composer missed this on **every** seed                                                       |
| `maze-walk`   | Step-by-step                   | `move(E/W/N/S)` repeatedly, `maze_status`, then `submit` at exit — Opus often **timed out** (25s slot cap) |


**Takeaways:** Composer 2.5 is fastest on every suite and flawless on quick/full, but never clears all three maze tasks (stuck on `**maze-medium`**). GPT 5.5 is slower but the only model **flawless on all three maze seeds**. Opus models are fine on quick; on maze they struggle with `**maze-walk`** (interactive), and on full they occasionally drop one example task on seed 42.

Reproduce or refresh:

```bash
npm run compare:models          # sweep (see configs/model-comparison/manifest.json)
npm run compare:summarize       # writes docs/MODEL_COMPARISON.md
```

Flags: `--dry-run`, `--only quick`, `--only-model gpt-5.5`, `--from-run 12`, `--sleep-ms 5000`, `--no-build`.

View results in the browser:

```bash
npm run viewer
```

Open [http://localhost:5173](http://localhost:5173) — configure runs from the dashboard, watch live results, or pick a past run from the dropdown.

Run configuration — model, timing, task pack, and per-task selection

The run form:

- **All tasks in pack** — when checked, every problem in the pack runs and individual task toggles are locked
- **Max bench time** — auto-fills to the minimum (`slotMs × worldCount` in seconds) whenever slot length or task selection changes; you can raise it for extra headroom
- **Validation** — invalid duration or task selection is blocked with a field highlight before start

Cream UI, Georgia prose, monospace numbers.

Local orchestrator only:

```bash
npm run bench -- --config configs/quick.json --world-url http://127.0.0.1:3100
```

List available problems:

```bash
npm run bench:list
# or: npm run bench -- --list-problems --pack example
```

## CLI overrides

Any profile field can be overridden on the command line:

```bash
npm run bench -- \
  --model auto \
  --slot-ms 30000 \
  --duration 120 \
  --problems math-quiz,pick-color,write-greeting \
  --pack example
```

When using Docker, `TASK_PACK`, `PROBLEM_IDS`, and `WORLD_ASSIGNMENTS` must match on **both** agent and world containers (use `compose:bench` or the viewer dashboard — assignments are computed automatically).

## Maze world (`task-packs/maze`)

Dedicated pack with maze problems and extra MCP tools `move` and `maze_status`.

Live maze solve — grid, path trail, and MCP activity feed

*Live view during `configs/maze.json`: agent walking `maze-walk` step-by-step via `move`; click **Watch live** while a run is in progress.*


| Problem       | Type        | Description                                               |
| ------------- | ----------- | --------------------------------------------------------- |
| `maze-easy`   | path        | Submit a move sequence from S to E (small grid)           |
| `maze-medium` | path        | Larger grid, longer path                                  |
| `maze-walk`   | interactive | Use `move(N/S/E/W)` step-by-step, then `submit` when on E |


```bash
npm run compose:bench -- configs/maze.json
```

Local maze world:

```bash
TASK_PACK=maze WORLD_ID=0 WORLD_ASSIGNMENTS=0:maze-easy npm run world:dev
```

## Local dev (single world)

Terminal 1 — world server:

```bash
npm install
npm run world:dev
```

Terminal 2 — orchestrator (requires `CURSOR_API_KEY`):

```bash
export CURSOR_API_KEY=cursor_...
npm run bench -- \
  --world-url http://127.0.0.1:3100 \
  --duration 15 \
  --slot-ms 5000 \
  --seed 42 \
  --stub-cwd packages/agent-stub \
  --results-dir results
```

## Environment variables


| Variable            | Default        | Description                                                                      |
| ------------------- | -------------- | -------------------------------------------------------------------------------- |
| `CURSOR_API_KEY`    | —              | Required SDK API key                                                             |
| `SLOT_MS`           | `5000`         | Max time per world slot (timeout cap); slots end early on successful submit      |
| `BENCH_DURATION_MS` | `120000`       | Max total bench wall time; must be ≥ `SLOT_MS × WORLD_COUNT`                     |
| `BENCH_SEED`        | `42`           | RNG seed for world selection                                                     |
| `WORLD_COUNT`       | `8`            | Used when `WORLD_URLS` unset                                                     |
| `MODEL_ID`          | `composer-2.5` | SDK model id                                                                     |
| `TASK_PACK`         | `example`      | Pack id under `task-packs/`                                                      |
| `PROBLEM_IDS`       | —              | Comma-separated problem ids (default: all in pack)                               |
| `WORLD_ASSIGNMENTS` | —              | Comma-separated `worldId:problemId` pairs (auto-set by viewer / `compose:bench`) |
| `BENCH_CONFIG`      | —              | Path to bench profile JSON (optional)                                            |


Override world URLs (comma-separated MCP base URLs):

```bash
WORLD_URLS=http://world-0:3100/mcp,http://world-1:3100/mcp
```

## Task pack format

See `[task-packs/example/manifest.json](task-packs/example/manifest.json)`.

Each problem defines:

- `id`, `title`, `prompt`, `artifacts`
- `allowShell` (optional) — enables `run_shell` MCP tool
- `verify` — one of:
  - `{ "type": "command", "cmd": "...", "timeoutMs": 3000 }`
  - `{ "type": "fileContains", "path": "...", "expected": "..." }`
  - `{ "type": "jsonMatch", "expected": { "answer": 42 } }`

Problem files live in `task-packs/<pack>/problems/` and are copied into each world at `/world`.

## World MCP tools


| Tool            | Description                   |
| --------------- | ----------------------------- |
| `list_problems` | All problems with solved flag |
| `get_problem`   | Prompt + artifact paths       |
| `read_file`     | Read under `/world`           |
| `write_file`    | Write under `/world`          |
| `run_shell`     | Shell in world (when allowed) |
| `submit`        | Verify and mark solved        |
| `world_status`  | Solve progress                |


Orchestrator scores via `GET /status` on each world.

## Results JSON

Each run records per-slot metrics (`worldId`, `solvedDelta`, `solveDurationMs`, `exitReason`, `runId`, `assistantChars`) and aggregates (`totalSolvedDelta`, `perWorldVisitCount`, `uniqueSolvedByWorld`).

Slots end as soon as the assigned task is successfully submitted; failed submits may retry until the slot timeout (`SLOT_MS`).

## Security

- Task packs mounted read-only into worlds
- `run_shell` blocked unless `allowShell: true` on the problem
- Agent stub workspace contains no secrets