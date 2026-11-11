// The local stack the web app runs on: Postgres, Mailpit and an S3 store (docker-compose.dev.yml).
//
//   pnpm db:start              starts it, applies the migrations, creates the buckets, loads the catalog
//   pnpm db:stop               stops it, keeping the data
//   pnpm db:reset              drops every table, runs the migrations again and reloads the catalog
//   pnpm db:generate           writes the migration for a change of packages/db/src/schema
//   node scripts/db.mjs seed   loads the services catalog (scripts/seed/services.sql) again
//   node scripts/db.mjs migrate
//       applies the migrations to DATABASE_URL, creates the buckets of S3_* and loads the catalog
//       into an empty database: what a deployment runs before the app starts (docker-compose.yml)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMPOSE = ['compose', '-f', join(ROOT, 'docker-compose.dev.yml')]
const MIGRATIONS = join(ROOT, 'packages/db/migrations')
const SEED = join(ROOT, 'scripts/seed/services.sql')
const BUCKETS_READY_TIMEOUT_MS = 60_000

export const LOCAL_ENV = {
    DATABASE_URL: 'postgres://lumvika:lumvika@127.0.0.1:54432/lumvika',
    S3_ENDPOINT: 'http://127.0.0.1:54437',
    S3_ACCESS_KEY_ID: 'lumvika',
    S3_SECRET_ACCESS_KEY: 'lumvika-secret',
    SMTP_URL: 'smtp://127.0.0.1:54435',
}
export const MAILPIT_URL = 'http://127.0.0.1:54436'

const fromDb = createRequire(join(ROOT, 'packages/db/package.json'))

export function loadPg() {
    return fromDb('pg')
}

function run(command, args, { cwd = ROOT, env = process.env } = {}) {
    execFileSync(command, args, { cwd, env, stdio: 'inherit' })
}

async function withClient(databaseUrl, work) {
    const pg = loadPg()
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
        return await work(client)
    } finally {
        await client.end()
    }
}

async function applyMigrations(databaseUrl) {
    const { drizzle } = fromDb('drizzle-orm/node-postgres')
    const { migrate } = fromDb('drizzle-orm/node-postgres/migrator')
    await withClient(databaseUrl, client => migrate(drizzle(client), { migrationsFolder: MIGRATIONS, migrationsSchema: 'drizzle', migrationsTable: 'migrations' }))
    console.log('Migrations applied.')
}

// The S3 store can take a few seconds to answer after its container starts.
async function ensureBuckets(env) {
    const deadline = Date.now() + BUCKETS_READY_TIMEOUT_MS
    const script = "import('@lumvika/storage/s3').then(s => s.ensureBuckets())"
    for (;;) {
        try {
            execFileSync('node', ['--experimental-strip-types', '--no-warnings', '-e', script], { cwd: join(ROOT, 'apps/ui'), env, stdio: ['ignore', 'ignore', 'pipe'] })
            console.log('Buckets ready.')
            return
        } catch (error) {
            if (Date.now() > deadline) throw new Error(`The S3 store at ${env.S3_ENDPOINT} did not create the buckets: ${String(error.stderr ?? error).trim()}`)
            await new Promise(done => setTimeout(done, 2000))
        }
    }
}

async function loadCatalog(databaseUrl, { onlyIfEmpty }) {
    await withClient(databaseUrl, async client => {
        if (onlyIfEmpty) {
            const { rows } = await client.query('select count(*)::int as count from public.services')
            if (rows[0].count > 0) return
        }
        await client.query(readFileSync(SEED, 'utf8'))
        console.log('Services catalog loaded.')
    })
}

function localEnv() {
    return { ...process.env, ...LOCAL_ENV }
}

async function start() {
    run('docker', [...COMPOSE, 'up', '-d', '--wait'])
    await applyMigrations(LOCAL_ENV.DATABASE_URL)
    await ensureBuckets(localEnv())
    await loadCatalog(LOCAL_ENV.DATABASE_URL, { onlyIfEmpty: true })
    console.log(`\nPostgres  ${LOCAL_ENV.DATABASE_URL}\nMailpit   ${MAILPIT_URL}\nS3        ${LOCAL_ENV.S3_ENDPOINT} (console http://127.0.0.1:54438)`)
}

async function reset() {
    run('docker', [...COMPOSE, 'exec', '-T', 'postgres', 'psql', '-U', 'lumvika', '-d', 'lumvika', '-c', 'drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists drizzle cascade; create schema public;'])
    await applyMigrations(LOCAL_ENV.DATABASE_URL)
    await loadCatalog(LOCAL_ENV.DATABASE_URL, { onlyIfEmpty: false })
}

function targetEnv() {
    return { ...localEnv(), ...Object.fromEntries(Object.keys(LOCAL_ENV).filter(key => process.env[key]).map(key => [key, process.env[key]])) }
}

async function migrateTarget() {
    const env = targetEnv()
    await applyMigrations(env.DATABASE_URL)
    await ensureBuckets(env)
    await loadCatalog(env.DATABASE_URL, { onlyIfEmpty: true })
}

const COMMANDS = {
    start,
    stop: () => run('docker', [...COMPOSE, 'stop']),
    reset,
    generate: () => run('pnpm', ['--filter', '@lumvika/db', 'exec', 'drizzle-kit', 'generate'], { env: localEnv() }),
    migrate: migrateTarget,
    seed: () => loadCatalog(targetEnv().DATABASE_URL, { onlyIfEmpty: false }),
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const command = COMMANDS[process.argv[2]]
    if (!command) {
        console.error(`Usage: node scripts/db.mjs ${Object.keys(COMMANDS).join('|')}`)
        process.exit(1)
    }
    try {
        await command()
    } catch (error) {
        console.error(`\n${error.message ?? error}\n`)
        process.exit(1)
    }
}
