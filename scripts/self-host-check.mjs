#!/usr/bin/env node
// Checks `.env` before the first `docker compose up`: fills the secrets left empty, then stops on what
// only you can provide, saying where to find it. Node alone runs it, before any `pnpm install`.
//
//   node scripts/self-host-check.mjs

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const FILE = '.env'
const GENERATED = [
    'POSTGRES_PASSWORD',
    'BETTER_AUTH_SECRET',
    'S3_SECRET_ACCESS_KEY',
    'LUMVIKA_ENGINE_API_KEY',
    'STEWARD_HUB_TOKEN_SECRET',
    'BOARD_IMAGE_SECRET',
    'UNSUBSCRIBE_SECRET',
    'PUBLISHED_ACCESS_SECRET',
    'MOBILE_OAUTH_TICKET_SECRET',
]
const REQUIRED = {
    NEXT_PUBLIC_APP_URL: 'the address people open, e.g. http://localhost:3000',
    NEXT_PUBLIC_STORAGE_URL: 'the address browsers load images from, e.g. http://localhost:3002 (LUMVIKA_STORAGE_PORT)',
}

if (!existsSync(FILE)) {
    console.error('No .env here. Run `cp .env.example .env` first, from the root of the repository.')
    process.exit(1)
}

let text = readFileSync(FILE, 'utf8')
const valueOf = (key) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? ''

const generated = []
for (const key of GENERATED) {
    if (valueOf(key)) continue
    // S3-compatible stores cap a secret key at 40 characters.
    const value = randomBytes(key === 'S3_SECRET_ACCESS_KEY' ? 20 : 32).toString('hex')
    text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`
    generated.push(key)
}
if (generated.length) writeFileSync(FILE, text)

const problems = []
for (const [key, where] of Object.entries(REQUIRED)) {
    if (!valueOf(key)) problems.push(`${key} is empty: ${where}`)
}
for (const key of ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_STORAGE_URL']) {
    const url = valueOf(key)
    if (url && (!/^https?:\/\//.test(url) || url.endsWith('/'))) problems.push(`${key} must start with http:// or https:// and end without a slash`)
}
// Without a mailer the sign-in code goes nowhere, and nobody can sign in.
if (!valueOf('RESEND_API_KEY') && !valueOf('SMTP_URL')) problems.push('RESEND_API_KEY and SMTP_URL are both empty: set one, people sign in with a code sent by email')
const smtpUrl = valueOf('SMTP_URL')
if (smtpUrl && !/^smtps?:\/\//.test(smtpUrl)) problems.push('SMTP_URL must start with smtp:// or smtps://')
const databaseUrl = valueOf('DATABASE_URL')
if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push('DATABASE_URL must start with postgres://, or stay empty to use the Postgres of docker compose')
for (const provider of ['GOOGLE', 'APPLE']) {
    if (Boolean(valueOf(`${provider}_CLIENT_ID`)) !== Boolean(valueOf(`${provider}_CLIENT_SECRET`))) problems.push(`${provider}_CLIENT_ID and ${provider}_CLIENT_SECRET go together: set both or neither`)
}
for (const provider of valueOf('NEXT_PUBLIC_OAUTH_PROVIDERS').split(',').map((name) => name.trim()).filter(Boolean)) {
    if (!valueOf(`${provider.toUpperCase()}_CLIENT_ID`)) problems.push(`NEXT_PUBLIC_OAUTH_PROVIDERS offers ${provider}, but ${provider.toUpperCase()}_CLIENT_ID is empty`)
}
if (!valueOf('OPENROUTER_API_KEY')) console.warn('! OPENROUTER_API_KEY is empty: the Steward skips the guided onboarding. It and your coworkers run on the AI you connect in the app.')
if (valueOf('RESEND_API_KEY') && !valueOf('RESEND_FROM')) console.warn("! RESEND_FROM is not set: Resend's test sender only delivers to the address of your Resend account.")

if (generated.length) console.log(`Generated ${generated.join(', ')} in .env`)
if (problems.length) {
    console.error(`\n${problems.map((problem) => `x ${problem}`).join('\n')}\n`)
    process.exit(1)
}

console.log(`
.env is ready. Next:
  docker compose up -d --build
  open ${valueOf('NEXT_PUBLIC_APP_URL')}`)
