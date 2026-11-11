import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://lumvika:lumvika@127.0.0.1:54432/postgres'
export const TEST_DATABASE = 'lumvika_test'
const MIGRATIONS = fileURLToPath(new URL('../../migrations', import.meta.url))

// Each suite that rebuilds a database names its own, so suites running in parallel never drop one
// another's.
export function testDatabaseUrl(name = TEST_DATABASE): string {
    const url = new URL(ADMIN_URL)
    url.pathname = `/${name}`
    return url.toString()
}

// A database of its own, rebuilt from the migrations on every run, so a test never reads the rows
// the app wrote while you were clicking around.
export async function resetTestDatabase(name = TEST_DATABASE): Promise<void> {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid test database name: ${name}`)
    const admin = new pg.Client({ connectionString: ADMIN_URL })
    await admin.connect()
    try {
        await admin.query(`drop database if exists ${name} with (force)`)
        await admin.query(`create database ${name}`)
    } finally {
        await admin.end()
    }

    const client = new pg.Client({ connectionString: testDatabaseUrl(name) })
    await client.connect()
    try {
        await migrate(drizzle(client), { migrationsFolder: MIGRATIONS, migrationsSchema: 'drizzle', migrationsTable: 'migrations' })
    } finally {
        await client.end()
    }
}

// Whether the local Postgres of `pnpm db:start` answers, so a test that needs it can skip without it.
export async function testDatabaseReachable(): Promise<boolean> {
    const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 1000 })
    try {
        await client.connect()
        await client.end()
        return true
    } catch {
        return false
    }
}
