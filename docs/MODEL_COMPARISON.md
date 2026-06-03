# Model comparison (World Hop Benchmark)

Generated: 2026-06-03T06:21:52.991Z

## Experimental design

- **Harness**: Cursor SDK `Agent` / `Run` with HTTP MCP world tools (not chat-completions).
- **Suites**: `quick` (3 tasks), `maze` (3 tasks), `full` (8 tasks) — see `configs/*.json`.
- **Seeds**: 42, 43, 44 (3 replicates per model per suite).
- **Fairness**: Same seed ⇒ same `WORLD_ASSIGNMENTS` and visit order for all models on that suite.

## Model IDs

| Display name | SDK `MODEL_ID` |
|--------------|----------------|
| Composer 2.5 | `composer-2.5` |
| Opus 4.8 | `claude-opus-4-8` |
| GPT 5.5 | `gpt-5.5` |
| Opus 4.7 | `claude-opus-4-7` |

## quick

| Model | Solve rate (mean ± σ) | Pass@3 | Median wall | Mean solve time | Mean tool calls | Timeouts |
|-------|----------------------|--------|-------------|-----------------|-----------------|----------|
| Composer 2.5 | 100.0% ± 0.0pp | 100.0% | 11.8s | 10.9s | 10.0 | 0 |
| GPT 5.5 | 100.0% ± 0.0pp | 100.0% | 32.8s | 32.6s | 9.7 | 0 |
| Opus 4.7 | 100.0% ± 0.0pp | 100.0% | 24.6s | 26.7s | 9.7 | 0 |
| Opus 4.8 | 100.0% ± 0.0pp | 100.0% | 34.0s | 33.7s | 10.0 | 0 |

### Per-seed detail

**Composer 2.5** (`composer-2.5`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 3/3 | 100.0% | 11.8s | 10 | 0 | compare-quick-composer-2-5-s42-composer-2-5-60s-15s-slots__2026-06-03T05-41-14-399Z.json |
| 43 | 3/3 | 100.0% | 9.2s | 10 | 0 | compare-quick-composer-2-5-s43-composer-2-5-60s-15s-slots__2026-06-03T05-41-40-312Z.json |
| 44 | 3/3 | 100.0% | 13.2s | 10 | 0 | compare-quick-composer-2-5-s44-composer-2-5-60s-15s-slots__2026-06-03T05-42-03-608Z.json |

**GPT 5.5** (`gpt-5.5`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 3/3 | 100.0% | 30.5s | 9 | 0 | compare-quick-gpt-5-5-s42-gpt-5-5-60s-15s-slots__2026-06-03T05-59-20-486Z.json |
| 43 | 3/3 | 100.0% | 32.8s | 10 | 0 | compare-quick-gpt-5-5-s43-gpt-5-5-60s-15s-slots__2026-06-03T06-00-05-119Z.json |
| 44 | 3/3 | 100.0% | 36.2s | 10 | 0 | compare-quick-gpt-5-5-s44-gpt-5-5-60s-15s-slots__2026-06-03T06-00-51-948Z.json |

**Opus 4.7** (`claude-opus-4-7`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 3/3 | 100.0% | 24.1s | 10 | 0 | compare-quick-opus-4-7-s42-opus-4-7-60s-15s-slots__2026-06-03T06-10-05-513Z.json |
| 43 | 3/3 | 100.0% | 32.8s | 9 | 0 | compare-quick-opus-4-7-s43-opus-4-7-60s-15s-slots__2026-06-03T06-10-43-709Z.json |
| 44 | 3/3 | 100.0% | 24.6s | 10 | 0 | compare-quick-opus-4-7-s44-opus-4-7-60s-15s-slots__2026-06-03T06-11-30-659Z.json |

**Opus 4.8** (`claude-opus-4-8`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 3/3 | 100.0% | 33.9s | 10 | 0 | compare-quick-opus-4-8-s42-opus-4-8-60s-15s-slots__2026-06-03T05-47-38-217Z.json |
| 43 | 3/3 | 100.0% | 34.9s | 10 | 0 | compare-quick-opus-4-8-s43-opus-4-8-60s-15s-slots__2026-06-03T05-48-26-215Z.json |
| 44 | 3/3 | 100.0% | 34.0s | 10 | 0 | compare-quick-opus-4-8-s44-opus-4-8-60s-15s-slots__2026-06-03T05-49-15-178Z.json |

## maze

| Model | Solve rate (mean ± σ) | Pass@3 | Median wall | Mean solve time | Mean tool calls | Timeouts |
|-------|----------------------|--------|-------------|-----------------|-----------------|----------|
| Composer 2.5 | 66.7% ± 0.0pp | 0.0% | 32.0s | 26.1s | 16.3 | 1 |
| GPT 5.5 | 100.0% ± 0.0pp | 100.0% | 49.3s | 46.6s | 16.0 | 0 |
| Opus 4.7 | 88.9% ± 19.2pp | 66.7% | 53.4s | 42.6s | 13.3 | 1 |
| Opus 4.8 | 77.8% ± 19.2pp | 33.3% | 61.3s | 40.0s | 14.0 | 2 |

### Per-seed detail

**Composer 2.5** (`composer-2.5`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 2/3 | 66.7% | 32.0s | 17 | 0 | compare-maze-composer-2-5-s42-composer-2-5-90s-25s-slots__2026-06-03T05-42-31-035Z.json |
| 43 | 2/3 | 66.7% | 46.9s | 15 | 1 | compare-maze-composer-2-5-s43-composer-2-5-90s-25s-slots__2026-06-03T05-43-17-127Z.json |
| 44 | 2/3 | 66.7% | 25.8s | 17 | 0 | compare-maze-composer-2-5-s44-composer-2-5-90s-25s-slots__2026-06-03T05-44-18-281Z.json |

**GPT 5.5** (`gpt-5.5`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 3/3 | 100.0% | 51.7s | 16 | 0 | compare-maze-gpt-5-5-s42-gpt-5-5-90s-25s-slots__2026-06-03T06-01-42-400Z.json |
| 43 | 3/3 | 100.0% | 40.6s | 16 | 0 | compare-maze-gpt-5-5-s43-gpt-5-5-90s-25s-slots__2026-06-03T06-02-48-155Z.json |
| 44 | 3/3 | 100.0% | 49.3s | 16 | 0 | compare-maze-gpt-5-5-s44-gpt-5-5-90s-25s-slots__2026-06-03T06-03-42-828Z.json |

**Opus 4.7** (`claude-opus-4-7`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 2/3 | 66.7% | 66.4s | 12 | 1 | compare-maze-opus-4-7-s42-opus-4-7-90s-25s-slots__2026-06-03T06-12-09-426Z.json |
| 43 | 3/3 | 100.0% | 35.9s | 14 | 0 | compare-maze-opus-4-7-s43-opus-4-7-90s-25s-slots__2026-06-03T06-13-29-937Z.json |
| 44 | 3/3 | 100.0% | 53.4s | 14 | 0 | compare-maze-opus-4-7-s44-opus-4-7-90s-25s-slots__2026-06-03T06-14-19-953Z.json |

**Opus 4.8** (`claude-opus-4-8`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 2/3 | 66.7% | 61.3s | 13 | 1 | compare-maze-opus-4-8-s42-opus-4-8-90s-25s-slots__2026-06-03T05-50-03-515Z.json |
| 43 | 2/3 | 66.7% | 62.3s | 14 | 1 | compare-maze-opus-4-8-s43-opus-4-8-90s-25s-slots__2026-06-03T05-51-18-948Z.json |
| 44 | 3/3 | 100.0% | 50.2s | 15 | 0 | compare-maze-opus-4-8-s44-opus-4-8-90s-25s-slots__2026-06-03T05-52-35-324Z.json |

## full

| Model | Solve rate (mean ± σ) | Pass@3 | Median wall | Mean solve time | Mean tool calls | Timeouts |
|-------|----------------------|--------|-------------|-----------------|-----------------|----------|
| Composer 2.5 | 100.0% ± 0.0pp | 100.0% | 38.6s | 38.0s | 34.7 | 0 |
| GPT 5.5 | 100.0% ± 0.0pp | 100.0% | 93.8s | 91.1s | 32.0 | 0 |
| Opus 4.7 | 95.8% ± 7.2pp | 66.7% | 95.9s | 91.3s | 28.3 | 1 |
| Opus 4.8 | 95.8% ± 7.2pp | 66.7% | 96.0s | 88.2s | 33.3 | 1 |

### Per-seed detail

**Composer 2.5** (`composer-2.5`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 8/8 | 100.0% | 31.5s | 34 | 0 | compare-full-composer-2-5-s42-composer-2-5-240s-30s-slots__2026-06-03T05-44-58-629Z.json |
| 43 | 8/8 | 100.0% | 45.4s | 36 | 0 | compare-full-composer-2-5-s43-composer-2-5-240s-30s-slots__2026-06-03T05-45-44-924Z.json |
| 44 | 8/8 | 100.0% | 38.6s | 34 | 0 | compare-full-composer-2-5-s44-composer-2-5-240s-30s-slots__2026-06-03T05-46-45-062Z.json |

**GPT 5.5** (`gpt-5.5`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 8/8 | 100.0% | 77.7s | 33 | 0 | compare-full-gpt-5-5-s42-gpt-5-5-240s-30s-slots__2026-06-03T06-04-46-910Z.json |
| 43 | 8/8 | 100.0% | 103.3s | 31 | 0 | compare-full-gpt-5-5-s43-gpt-5-5-240s-30s-slots__2026-06-03T06-06-19-226Z.json |
| 44 | 8/8 | 100.0% | 93.8s | 32 | 0 | compare-full-gpt-5-5-s44-gpt-5-5-240s-30s-slots__2026-06-03T06-08-17-242Z.json |

**Opus 4.7** (`claude-opus-4-7`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 7/8 | 87.5% | 141.2s | 28 | 1 | compare-full-opus-4-7-s42-opus-4-7-240s-30s-slots__2026-06-03T06-15-27-839Z.json |
| 43 | 8/8 | 100.0% | 68.3s | 27 | 0 | compare-full-opus-4-7-s43-opus-4-7-240s-30s-slots__2026-06-03T06-18-03-690Z.json |
| 44 | 8/8 | 100.0% | 95.9s | 30 | 0 | compare-full-opus-4-7-s44-opus-4-7-240s-30s-slots__2026-06-03T06-19-26-695Z.json |

**Opus 4.8** (`claude-opus-4-8`)

| Seed | Solved | Rate | Wall | Tools | Timeouts | Results file |
|------|--------|------|------|-------|----------|--------------|
| 42 | 7/8 | 87.5% | 107.4s | 33 | 1 | compare-full-opus-4-8-s42-opus-4-8-240s-30s-slots__2026-06-03T05-53-40-028Z.json |
| 43 | 8/8 | 100.0% | 96.0s | 35 | 0 | compare-full-opus-4-8-s43-opus-4-8-240s-30s-slots__2026-06-03T05-55-42-300Z.json |
| 44 | 8/8 | 100.0% | 92.8s | 32 | 0 | compare-full-opus-4-8-s44-opus-4-8-240s-30s-slots__2026-06-03T05-57-33-184Z.json |

## Raw artifacts

- Run log: `results/comparison-run-log.jsonl` (local, gitignored)
- Per-run JSON: `results/*.json` with `config.profileName` prefix `compare-`
