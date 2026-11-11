import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import * as schema from './schema'

export type Schema = typeof schema
export type Db = NodePgDatabase<Schema>

// int8 arrives as a string by default; every id and counter here fits a JS number, and Supabase
// handed them over as numbers. Drizzle's typed selects convert on their own, raw SQL relies on this.
pg.types.setTypeParser(pg.types.builtins.INT8, value => Number(value))
pg.types.setTypeParser(pg.types.builtins.NUMERIC, value => Number(value))

type PoolHolder = { pool: pg.Pool; db: Db }

// One pool per process: Next.js re-evaluates modules on every hot reload in dev, and a pool per
// evaluation would leave the old connections open until Postgres refuses new ones.
const holder = globalThis as typeof globalThis & { __lumvikaDb?: PoolHolder }

function databaseUrl(): string {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set.')
    return url
}

function open(): PoolHolder {
    const pool = new pg.Pool({ connectionString: databaseUrl(), max: Number(process.env.DATABASE_POOL_MAX ?? 10) })
    // pg-pool reports an idle client's error here; without a listener it would end the process.
    pool.on('error', error => console.error('[db] idle connection lost', error))
    return { pool, db: drizzle(pool, { schema }) }
}

export function getDb(): Db {
    holder.__lumvikaDb ??= open()
    return holder.__lumvikaDb.db
}

export function getPool(): pg.Pool {
    holder.__lumvikaDb ??= open()
    return holder.__lumvikaDb.pool
}

export async function closeDb(): Promise<void> {
    const current = holder.__lumvikaDb
    holder.__lumvikaDb = undefined
    await current?.pool.end()
}
