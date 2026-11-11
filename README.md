# Lumvika

AI coworkers that run your work: pick or build an agent, connect your tools, and it works on its own
machine around the clock. You bring the model through your own API key or subscription.

Lumvika is free software under the [AGPL-3.0](LICENSE). See [NOTICE.md](NOTICE.md) for its origin.

## What is in here

| Path | What it is |
|---|---|
| `apps/ui` | Web app and API (Next.js 16, React 19) |
| `apps/engine` | Runs the coworkers, their tools, browser and screen (Hono) |
| `apps/mobile` | iPhone app (Expo) |
| `apps/docs` | Documentation (Mintlify) |
| `packages/*` | Contracts, design system, emails, i18n, analytics, storage, database (`packages/db`: schema, migrations, helpers) |
| `branding/` | Logo, favicons, colors and type |

## Setup

You need Node 22, pnpm 8 (`corepack enable`), Docker for the local stack (Postgres, Mailpit and an S3
store), and a model key such as OpenRouter.

```bash
pnpm install
pnpm db:start
pnpm --filter @lumvika/contracts build
cp .env.example apps/ui/.env
cp apps/engine/.env.example apps/engine/.env
```

Fill both files. Use the same long random string for `LUMVIKA_ENGINE_API_KEY` in `apps/ui/.env` and
`LUMVIKA_API_KEY` in `apps/engine/.env`. [CONTRIBUTING.md](CONTRIBUTING.md) lists every value.

## Development

```bash
pnpm dev:engine    # http://localhost:3000
pnpm dev:ui        # http://localhost:3050
```

Sign-in codes land in Mailpit at <http://localhost:54436>.

## Checks and build

```bash
pnpm -r --if-present ts-check
pnpm --filter lumvika lint
pnpm --filter lumvika test
pnpm --filter lumvika-engine test
pnpm i18n:check
pnpm build
```

## Deployment

```bash
cp .env.example .env
node scripts/self-host-check.mjs
docker compose up -d --build
```

The check generates missing secrets and validates the rest. [INSTALL.md](INSTALL.md) has the full guide.
Set `NEXT_PUBLIC_APP_URL` to the public address, and `NEXT_PUBLIC_SOURCE_REPO_URL` to the repository
holding the exact code you run, as the AGPL requires for a network service.

Billing is not part of Lumvika. Every workspace has all features.

## License

[AGPL-3.0](LICENSE). If you run a modified version for others, offer them its source code.
