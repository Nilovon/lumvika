# The web app of Lumvika. Built from the repository root: docker build -f apps/ui/Dockerfile .
# The NEXT_PUBLIC_* values are read by the browser bundle, so Next.js inlines them at build time. The
# address of the app, of the file store, the admins and the sign-in providers are built as placeholders
# that the entrypoint replaces with this install's values on start (scripts/docker/apply-public-env.mjs),
# so one published image serves every install. The captcha and PostHog keys stay build arguments.
# The same image runs `node scripts/db.mjs migrate` (from /app) before the app starts: see docker-compose.yml.
FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG NEXT_PUBLIC_APP_URL=https://app-url.runtime.lumvika.invalid
ARG NEXT_PUBLIC_STORAGE_URL=https://storage-url.runtime.lumvika.invalid
ARG NEXT_PUBLIC_ADMIN_EMAILS=admin-emails@runtime.lumvika.invalid
ARG NEXT_PUBLIC_OAUTH_PROVIDERS=oauth-providers.runtime.lumvika.invalid
ARG NEXT_PUBLIC_SOURCE_REPO_URL
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
ARG NEXT_PUBLIC_BUILD_SHA
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_HCAPTCHA_SITE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SOURCE_REPO_URL=$NEXT_PUBLIC_SOURCE_REPO_URL \
    NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL \
    NEXT_PUBLIC_STORAGE_URL=$NEXT_PUBLIC_STORAGE_URL \
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=$NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN \
    NEXT_PUBLIC_ADMIN_EMAILS=$NEXT_PUBLIC_ADMIN_EMAILS \
    NEXT_PUBLIC_OAUTH_PROVIDERS=$NEXT_PUBLIC_OAUTH_PROVIDERS \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY=$NEXT_PUBLIC_HCAPTCHA_SITE_KEY \
    NEXT_PUBLIC_BUILD_SHA=$NEXT_PUBLIC_BUILD_SHA \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=6144
COPY . .
RUN --mount=type=cache,id=lumvika-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store --filter lumvika... --filter @lumvika/contracts
RUN --mount=type=cache,id=lumvika-ui-next-cache,target=/app/apps/ui/.next/cache \
    pnpm --filter @lumvika/contracts build && pnpm --filter lumvika build

FROM base
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app /app
WORKDIR /app/apps/ui
EXPOSE 3000
ENTRYPOINT ["/app/scripts/docker/app-entrypoint.sh"]
CMD ["node", "node_modules/next/dist/bin/next", "start"]
