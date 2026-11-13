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

## Self-hosting

Lumvika runs from two public images, `ghcr.io/schnebel-technologie/lumvika-app` and
`ghcr.io/schnebel-technologie/lumvika-engine`. [`docker-compose.yml`](docker-compose.yml) starts them
with Postgres, an S3 file store and a mail catcher, and generates every password and key on the first
start. You need Docker with Compose 2.24 or newer, nothing else:

```bash
mkdir lumvika && cd lumvika
curl -fsSLO https://raw.githubusercontent.com/schnebel-technologie/lumvika/main/docker-compose.yml
docker compose up -d
```

Open <http://localhost:3000> and sign in with your email. Until email is set up, the code lands in the
mail catcher at <http://localhost:3003>.

On a server, create a `.env` next to the compose file (every variable is in [.env.example](.env.example)):

```bash
NEXT_PUBLIC_APP_URL=https://lumvika.example.com
LUMVIKA_ENGINE_BROWSER_URL=https://engine.example.com
NEXT_PUBLIC_STORAGE_URL=https://files.example.com
RESEND_API_KEY=re_...                       # or SMTP_URL=smtps://user:password@smtp.example.com:465
RESEND_FROM=Lumvika <lumvika@example.com>
OPENROUTER_API_KEY=sk-or-...                # optional: the Steward's onboarding and default models
ADMIN_EMAILS=you@example.com
```

then `docker compose up -d` again, and put a reverse proxy with HTTPS in front of ports 3000 (app),
3001 (engine) and 3002 (file store). Update with `docker compose pull && docker compose up -d`.

The [install guide](https://docs.lumvika.com/self-host/install) covers the reverse proxy, the firewall,
backups and updates. [INSTALL.md](INSTALL.md) is the same guide written for an AI assistant doing the
install for you.

To run modified code, build the images from your clone with
`docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`, and set
`NEXT_PUBLIC_SOURCE_REPO_URL` to the repository holding that code, as the AGPL requires for a network
service.

Billing is not part of Lumvika. Every workspace has all features.

## License

[AGPL-3.0](LICENSE). If you run a modified version for others, offer them its source code.
