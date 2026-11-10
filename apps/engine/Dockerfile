# The engine of one workspace: its coworkers, their memory, files, schedules, browser and screen.
# Built from the repository root: docker build -f apps/engine/Dockerfile .
FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN --mount=type=cache,id=lumvika-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store --filter lumvika-engine...
RUN pnpm --filter @lumvika/contracts build && pnpm --filter lumvika-engine build
RUN pnpm --filter lumvika-engine deploy --prod /out

FROM base AS runtime
# git and jq for the coworkers' shell, Xvfb and the desktop packages for the screen a person can
# watch, Chromium's own dependencies for the browser tool.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git jq xvfb openbox x11vnc xdotool thunar xfce4-terminal adwaita-icon-theme tint2 hsetroot maim \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --shell /bin/bash lumvika && mkdir -p /data && chown lumvika:lumvika /data
COPY --from=build --chown=lumvika:lumvika /out /app
RUN npx --yes patchright@1.63.0 install-deps chromium && rm -rf /var/lib/apt/lists/*
# Codex drives a ChatGPT plan, at CODEX_VERSION (src/runtime/codex-cli.ts). Claude Code ships inside
# the Agent SDK, already in /app.
RUN npm install -g "@openai/codex@0.166.0"
USER lumvika
RUN cd /app && npx patchright install --no-shell chromium
ENV PATH="/home/lumvika/.local/bin:${PATH}" \
    NODE_ENV=production \
    LUMVIKA_DATA_DIR=/data \
    LUMVIKA_HOST=0.0.0.0 \
    LUMVIKA_PORT=3000 \
    LUMVIKA_CODEX_PATH=/usr/local/bin/codex
VOLUME /data
EXPOSE 3000
CMD ["node", "dist/cli/bin.js", "run"]
