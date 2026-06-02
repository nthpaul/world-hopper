FROM node:20-bookworm-slim

WORKDIR /app

COPY packages/orchestrator/package.json ./
RUN npm install

COPY packages/orchestrator/tsconfig.json ./
COPY packages/orchestrator/src ./src
COPY packages/agent-stub /app/agent-stub

RUN npm run build && npm prune --omit=dev

ENV AGENT_STUB_CWD=/app/agent-stub
ENV RESULTS_DIR=/app/results
ENV WORLD_COUNT=8
ENV SLOT_MS=5000
ENV BENCH_DURATION_MS=120000

RUN mkdir -p /app/results

CMD ["node", "dist/bench.js"]
