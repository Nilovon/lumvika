// The local stack the web app runs on: Postgres, Mailpit and an S3 store (docker-compose.dev.yml).
//
//   pnpm db:start   starts it, applies the migrations, creates the buckets
//   pnpm db:stop    stops it, keeping the data
//   pnpm db:reset   drops every table and runs the migrations again
//   pnpm db:generate writes the migration for a change of packages/db/src/schema
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMPOSE = ['compose', '-f', join(ROOT, 'docker-compose.dev.yml')]
export const LOCAL_ENV = {
    DATABASE_URL: 'postgres://lumvika:lumvika@127.0.0.1:54432/lumvika',
    S3_ENDPOINT: 'http://127.0.0.1:54437',
    S3_ACCESS_KEY_ID: 'lumvika',
    S3_SECRET_ACCESS_KEY: 'lumvika-secret',
    SMTP_URL: 'smtp://127.0.0.1:54435',
}

const env = { ...process.env, ...LOCAL_ENV, ...Object.fromEntries(Object.keys(LOCAL_ENV).filter(key => process.env[key]).map(key => [key, process.env[key]])) }
const run = (command, args, cwd = ROOT) => execFileSync(command, args, { cwd, env, stdio: 'inherit' })
const db = args => run('pnpm', ['--filter', '@lumvika/db', 'exec', ...args])

function start() {
    run('docker', [...COMPOSE, 'up', '-d', '--wait'])
    db(['drizzle-kit', 'migrate'])
    run('node', ['--experimental-strip-types', '--no-warnings', '-e', "import('@lumvika/storage/s3').then(s => s.ensureBuckets()).then(() => console.log('Buckets ready.'))"], join(ROOT, 'apps/ui'))
    console.log(`\nPostgres  ${LOCAL_ENV.DATABASE_URL}\nMailpit   http://127.0.0.1:54436\nS3        ${LOCAL_ENV.S3_ENDPOINT} (console http://127.0.0.1:54438)`)
}

function reset() {
    run('docker', [...COMPOSE, 'exec', '-T', 'postgres', 'psql', '-U', 'lumvika', '-d', 'lumvika', '-c', 'drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists drizzle cascade; create schema public;'])
    db(['drizzle-kit', 'migrate'])
}

const commands = { start, stop: () => run('docker', [...COMPOSE, 'stop']), reset, generate: () => db(['drizzle-kit', 'generate']) }
const command = commands[process.argv[2]]
if (!command) {
    console.error(`Usage: node scripts/db.mjs ${Object.keys(commands).join('|')}`)
    process.exit(1)
}
command()
