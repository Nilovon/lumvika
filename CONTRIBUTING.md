# Contributing to Lumvika

Thank you for helping. This page covers running Lumvika from source, the shape of the code, and how a
pull request gets in.

## Run it from source

You need Node 22, pnpm 8 (`corepack enable`), Docker (for the local stack) and an OpenRouter key.

```bash
pnpm install
pnpm db:start                      # Postgres, Mailpit and an S3 store, migrated, with the services catalog
pnpm --filter @lumvika/contracts build
cp .env.example apps/ui/.env
cp apps/engine/.env.example apps/engine/.env
```

Then fill the two files. Pick any long random string as the engine key and use it in both:

| `apps/ui/.env` | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3050` |
| `DATABASE_URL` | `postgres://lumvika:lumvika@127.0.0.1:54432/lumvika` |
| `S3_ENDPOINT`, `NEXT_PUBLIC_STORAGE_URL` | `http://127.0.0.1:54437` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `lumvika`, `lumvika-secret` |
| `SMTP_URL` | `smtp://127.0.0.1:54435` (leave `RESEND_API_KEY` empty) |
| `BETTER_AUTH_SECRET` | any long random string |
| `OPENROUTER_API_KEY` | your OpenRouter key |
| `LUMVIKA_ENGINE_URL` | `http://localhost:3000` |
| `LUMVIKA_ENGINE_API_KEY` | the engine key |

| `apps/engine/.env` | Value |
|---|---|
| `LUMVIKA_API_KEY` | the engine key |
| `LUMVIKA_HUB_BASE_URL` | `http://localhost:3050` |

Start both, each in its own terminal:

```bash
pnpm dev:engine    # http://localhost:3000
pnpm dev:ui        # http://localhost:3050
```

The first workspace that needs an engine gets this one. Sign-in codes land in Mailpit, at
http://localhost:54436.

## The local stack

`docker-compose.dev.yml` holds what the app runs on: Postgres on 54432, Mailpit on 54435 (SMTP) and
54436 (inbox), an S3 store (RustFS) on 54437 and its console on 54438.

```bash
pnpm db:start                  # starts it, applies the migrations, creates the buckets, loads the catalog
pnpm db:stop                   # stops it, keeping the data
pnpm db:reset                  # drops every table, replays the migrations and the catalog
pnpm db:generate               # writes the migration for a change of packages/db/src/schema
node scripts/db.mjs seed       # reloads the services catalog (scripts/seed/services.sql)
```

The schema lives in `packages/db/src/schema` and every change to it comes as a migration in
`packages/db/migrations`. Row level security, grants and SQL functions go in custom SQL migrations, and
their tests in `packages/db/src/*.test.ts` (`pnpm --filter @lumvika/db test`, on a database of its own
rebuilt from the migrations). Some tables stay empty in a self-hosted install, because the code that
fills them belongs to Lumvika Cloud: billing, paid apps, the machine pool. They are part of the schema
all the same, so both run on the same migrations.

## Checks

```bash
pnpm -r --if-present ts-check
pnpm --filter lumvika lint
pnpm --filter lumvika test
pnpm --filter lumvika-engine test
pnpm --filter @lumvika/db test
```

CI runs the same, plus the migrations and the catalog on an empty database and both Docker images.

## The code

| Path | What it is |
|---|---|
| `apps/ui` | The web app and its API (Next.js). Talks to Postgres, the S3 store and the engine of each workspace |
| `apps/engine` | The engine: runs the coworkers, their tools, their memory, their browser and screen |
| `apps/docs` | The documentation (Mintlify) |
| `packages/contracts` | Types and schemas shared by the app and the engine |
| `packages/ui` | The design system and the board |
| `packages/db` | The database: Drizzle schema, migrations, query helpers and row level security tests |
| `packages/storage` | File storage on any S3-compatible store |

`CLAUDE.md` holds the conventions of the codebase (and is what coding agents read): database access
through the typed helpers, responsive from the first version, migrations of the engine data-dir.

`@lumvika/cloud/*` is the seam where Lumvika Cloud plugs in billing, paid apps, emails and its machine
pool. In this repository it resolves to `apps/ui/cloud-oss/`, the self-hosted behaviour. Pull requests that change what it
exports are unlikely to be merged.

## Pull requests

1. Open an issue first for anything bigger than a fix, so we agree on the direction.
2. Keep a pull request to one change, with tests where the code has them.

Lumvika is developed in a private repository that Lumvika Cloud deploys from, and this repository is
published from it at each release. A merged pull request is applied there with its author kept,
and comes back here with the next release, with credit in the release notes.

We will not take: anything that changes what `apps/ui/cloud-oss/` exports, a dependency with a license incompatible
with the AGPL, or a feature that only makes sense for one deployment.
