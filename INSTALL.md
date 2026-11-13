# Install Lumvika: a guide for AI assistants

You are helping someone install Lumvika, an open source app where AI coworkers do work for a team.
This file tells you how to get them from nothing to the Steward, Lumvika's guide, answering in their
browser. The full human guide is https://docs.lumvika.com/self-host/install: read it when a step
here is not enough.

## How to work

- **If you can run commands on their machine** (Claude Code, Codex, Cursor, a terminal agent): run
  the steps yourself, read every output, and only stop for what only the person can do: create an
  account, copy a key, choose a password, click in a dashboard.
- **If you are a chat in a browser** (claude.ai, chatgpt.com): you cannot touch their machine.
  Give one step at a time, with the exact command in a code block, and ask them to paste the
  output back before the next one. Never give the whole list at once.
- Keep it short. One question at a time, plain words, no jargon they did not use first.
- Never ask them to paste a secret key in the chat. Tell them which line of `.env` to put it on.

## 1. Ask two questions first

1. **Where should Lumvika run?** On this computer, to try it alone, or on a server, for a team.
2. **Do they have an OpenRouter key?** It runs the Steward's guided onboarding. They get one at
   https://openrouter.ai/keys. Without it the Steward skips the onboarding and runs on the AI they
   connect in the app, their Claude or ChatGPT subscription included.

On a server, ask a third: **how should it send email?** People sign in with a 6-digit code sent by
email. On their own computer the codes land in a mail catcher and nothing is needed. On a server,
offer the one that fits:
- *Resend* (https://resend.com): an API key, and a sending domain verified there for anyone but the
  Resend account owner to receive the codes.
- *Their own SMTP server*: any mailbox provider that gives SMTP credentials.

The database, the file storage and every password need no choice: `docker compose` runs and
generates them.

## 2. Check the machine

They need Docker with Docker Compose 2.24 or newer, running, with at least 4 GB of memory and 15 GB of
free disk. No Node.js, no Git: the images are published on GitHub.

```bash
docker compose version && docker info --format '{{.MemTotal}}'
```

Help them install what is missing before going on. On macOS, Docker Desktop's memory is in
**Settings > Resources**.

## 3. Get the compose file

```bash
mkdir lumvika && cd lumvika
curl -fsSLO https://raw.githubusercontent.com/lucabmn/lumvika/main/docker-compose.yml
```

Every command below runs from this folder.

## 4. Write `.env`

On their own computer, only when they have an OpenRouter key:

```bash
OPENROUTER_API_KEY=sk-or-...
ADMIN_EMAILS=<their email>
```

On a server, the public addresses (each on its own https domain) and the mailer too:

```bash
NEXT_PUBLIC_APP_URL=https://lumvika.their-domain.com
LUMVIKA_ENGINE_BROWSER_URL=https://engine.their-domain.com
NEXT_PUBLIC_STORAGE_URL=https://files.their-domain.com
OPENROUTER_API_KEY=sk-or-...
ADMIN_EMAILS=<their email>
```

**Resend:** walk them through it, they do the clicks.

1. Create an account on https://resend.com, add their domain in **Domains** and publish the DNS
   records it lists.
2. Create an API key in **API Keys** and put it in `.env`, with a sender on that domain:

   ```bash
   RESEND_API_KEY=re_...
   RESEND_FROM=Lumvika <lumvika@their-domain.com>
   ```

**Their own SMTP server:** `smtps://` for port 465, `smtp://` for 587 or 25:

```bash
SMTP_URL=smtps://<user>:<password>@<smtp host>:465
RESEND_FROM=Lumvika <lumvika@their-domain.com>
```

Do not fill the passwords or keys of Lumvika itself before the first start: it generates them into
the `secrets` volume. Every variable is described in
https://github.com/lucabmn/lumvika/blob/main/.env.example.

On a server, see "On a server" in the human guide for the reverse proxy and the firewall: Docker
publishes ports past `ufw`, so they must close 3000, 3001 and 3002 at their provider and reach them
through the proxy.

## 5. Start

```bash
docker compose up -d
```

The first start pulls the images: a few minutes on a slow connection. Every start runs `secrets`
(generates the passwords once) and `migrate` (database migrations, storage buckets, services catalog)
before the app starts.

## 6. Verify

```bash
docker compose ps -a
curl -s http://localhost:3000/api/version
docker compose exec engine curl -s http://localhost:3000/health
```

`postgres`, `storage`, `mailpit`, `app` and `engine` are running, `secrets` and `migrate` exited with
0, and both answer. If not, read `docker compose logs --tail 200 migrate app engine`, fix what it says,
and check https://docs.lumvika.com/self-host/troubleshooting.

## 7. Hand over

Tell them to open `NEXT_PUBLIC_APP_URL` (http://localhost:3000 by default), sign in with their email
and the 6-digit code, and say hi to the Steward: it asks what they need done and builds the team.
Without Resend or SMTP, the code is in the mail catcher at http://localhost:3003, reachable from that
machine only. Their coworkers use the AI they connect in the app: an Anthropic, OpenAI, Gemini or
OpenRouter key, or their Claude or ChatGPT subscription.

To update later:

```bash
docker compose pull && docker compose up -d
```

The `migrate` step applies the migrations a release adds before the app starts. Back up the
database first (`docker compose exec postgres pg_dump -U lumvika lumvika > backup.sql`).

Versions follow one rule: a patch (`v0.5.1`) only asks to pull, a minor (`v0.6.0`) has an
`Upgrade` section in its [release notes](https://github.com/lucabmn/lumvika/releases) to read
first. `LUMVIKA_VERSION=0.5` in `.env` keeps both images on the patches of `0.5`.
