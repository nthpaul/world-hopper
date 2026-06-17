# Slot trajectory export

Each completed bench slot can persist a replayable **activity trajectory**: assistant text, MCP tool calls, and world observations captured during the agent run. Trajectories are stored on each `SlotRecord` as `activity` in bench results JSON.

## Export to JSONL

Convert a results file into one JSONL line per slot (for SFT, preference pairs, or failure analysis):

```bash
npm run export:trajectories -- results/my-run.json
```

Write to a specific path:

```bash
npm run export:trajectories -- results/my-run.json --out datasets/my-run.jsonl
```

Each line includes run metadata, slot index, assigned `problemId`, binary `reward` (1 when `exitReason` is `solved`), mapped `actions`, and timing fields under `metadata`.

## Action mapping

| Live activity kind | Exported action type |
| ------------------ | -------------------- |
| `tool`             | `{ type: "tool", label, detail, ok }` |
| `assistant`, `thinking` | `{ type: "text", label, detail }` |
| `world`            | `{ type: "observation", label, detail, ok }` |

See [docs/samples/trajectories.example.jsonl](samples/trajectories.example.jsonl) for sample output shape.
