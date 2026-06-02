FROM node:20-bookworm-slim

WORKDIR /app

COPY packages/world/package.json ./
RUN npm install

COPY packages/world/tsconfig.json ./
COPY packages/world/src ./src
RUN npm run build && npm prune --omit=dev

ENV PORT=3100
ENV WORLD_ROOT=/world
ENV TASK_PACK_PATH=/task-packs/example
ENV WORLD_ID=0

EXPOSE 3100

CMD ["node", "dist/index.js"]
