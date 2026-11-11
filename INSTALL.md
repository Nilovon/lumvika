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

## 1. Ask three questions first

1. **Where should Lumvika run?** On this computer, to try it alone, or on a server, for a team.
2. **How should it send email?** People sign in with a 6-digit code sent by email. Offer the one
   that fits:
   - *Resend* (https://resend.com): an API key, and a sending domain verified there for anyone but
     the Resend account owner to receive the codes. Recommended on a server.
   - *Their own SMTP server*: any mailbox provider that gives SMTP credentials.
   The database and the file storage need no choice: `docker compose` runs both next to the app.
3. **Do they have an OpenRouter key?** It runs the Steward's guided onboarding. They get one at
   https://openrouter.ai/keys. Without it the Steward skips the onboarding and runs on the AI they
   connect in the app, their Claude or ChatGPT subscription included.

## 2. Check the machine

They need Git, Node.js 22 or newer, and Docker with Docker Compose running. Docker needs at least
6 GB of memory and 60 GB of free disk: the first build uses about 40.

```bash
git --version && node --version && docker compose version && docker info --format '{{.MemTotal}}'
```

Help them install what is missing before going on. On macOS, Docker Desktop's memory is in
**Settings > Resources**.

## 3. Get the code

```bash
git clone https://github.com/schnebel-technologie/lumvika.git && cd lumvika
cp .env.example .env
```

Every command below runs from this folder.

## 4. Set up email

**Resend:** walk them through it, they do the clicks.

1. Create an account on https://resend.com, add their domain in **Domains** and publish the DNS
   records it lists.
2. Create an API key in **API Keys** and put it in `.env`, with a sender on that domain:

   ```bash
   RESEND_API_KEY=re_...
   RESEND_FROM=Lumvika <lumvika@their-domain.com>
   ```

   Until the domain is verified, Resend only delivers to the address of their Resend account: enough
   for a first sign-in by that person alone.

**Their own SMTP server:** one line in `.env`, `smtps://` for port 465, `smtp://` for 587 or 25:

```bash
SMTP_URL=smtps://<user>:<password>@<smtp host>:465
```

with `RESEND_API_KEY` left empty, and `RESEND_FROM` uncommented with an address that server accepts.

## 5. Fill the rest of `.env`

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENROUTER_API_KEY=sk-or-...
ADMIN_EMAILS=<their email>
```

On a server, `NEXT_PUBLIC_APP_URL` is the https address the team opens,
`LUMVIKA_ENGINE_BROWSER_URL` the https address of the engine and `NEXT_PUBLIC_STORAGE_URL` the https
address of the file store, each on its own domain. They are baked in by the build, so set them now.
See "On a server" in the human guide for the reverse proxy and the firewall: Docker publishes ports
past `ufw`, so they must close 3000, 3001 and 3002 at their provider and reach them through the proxy.

## 6. Check and start

```bash
node scripts/self-host-check.mjs
```

It generates the secrets (the database password, the session secret, the storage key and the
engine key among them), checks the rest and prints the start command. When it stops, its message
says what to fix: do that and run it again. Then start:

```bash
docker compose up -d --build
```

The first build takes several minutes: say so, and wait. Every start runs `migrate` first, which
applies the database migrations, creates the storage buckets and loads the services catalog, then
the app starts.

## 7. Verify

```bash
docker compose ps
curl -s http://localhost:3000/api/version
docker compose exec engine curl -s http://localhost:3000/health
```

`postgres`, `storage`, `app` and `engine` are running, `migrate` exited with 0, and both
answer. If not, read `docker compose logs --tail 200 migrate app engine`, fix what it says, and check https://docs.lumvika.com/self-host/troubleshooting.

## 8. Hand over

Tell them to open `NEXT_PUBLIC_APP_URL`, sign in with their email and the 6-digit code, and say
hi to the Steward: it asks what they need done and builds the team. Their coworkers use the AI
they connect in the app: an Anthropic, OpenAI, Gemini or OpenRouter key, or their Claude or ChatGPT
subscription.

To update later:

```bash
git pull && docker compose up -d --build
```

The `migrate` step applies the migrations a release adds before the app starts. Back up the
database first (`docker compose exec postgres pg_dump -U lumvika lumvika > backup.sql`).

Versions follow one rule: a patch (`v0.5.1`) only asks to pull, a minor (`v0.6.0`) has an
`Upgrade` section in its [release notes](https://github.com/schnebel-technologie/lumvika/releases) to read
first. The engine image `ghcr.io/schnebel-technologie/lumvika-engine:0.5` follows the patches of `0.5`.
