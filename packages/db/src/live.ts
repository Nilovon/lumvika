import { getTableColumns, sql } from 'drizzle-orm'
import pg from 'pg'

import { selectMaybeSingle } from './helpers'
import type { Filters } from './filters'
import type { DbResult } from './result'
import { serviceScope, type DbScope } from './scope'
import { tableOf, type TableName, type TableRow } from './tables'

// The channel `public.live_notify` signals on (migration 0002_live).
export const LIVE_CHANNEL = 'lumvika_live'

// The whole row a key names, as the scope may see it: null when row level security hides it.
export function readRowByKey<T extends TableName>(scope: DbScope, table: T, key: Record<string, unknown>): Promise<DbResult<TableRow<T> | null>> {
    const columns = Object.keys(getTableColumns(tableOf(table))) as (keyof TableRow<T> & string)[]
    return selectMaybeSingle(scope, table, columns, key as Filters<T>) as Promise<DbResult<TableRow<T> | null>>
}

export async function notifyLive(payload: unknown): Promise<void> {
    await serviceScope().run(db => db.execute(sql`select pg_notify(${LIVE_CHANNEL}, ${JSON.stringify(payload)})`))
}

// The part of `pg.Client` a LISTEN connection uses.
export interface ListenClient {
    connect(): Promise<unknown>
    query(statement: string): Promise<unknown>
    on(event: 'notification', listener: (message: { channel: string; payload?: string | undefined }) => void): unknown
    on(event: 'error', listener: (error: Error) => void): unknown
    on(event: 'end', listener: () => void): unknown
    end(): Promise<void>
}

// A connection of its own, outside the pool: a session that LISTENs must stay open and must not go
// through a pooler in transaction mode, which would drop the LISTEN between statements.
export function openListenClient(connectionString = process.env.DATABASE_URL): ListenClient {
    if (!connectionString) throw new Error('DATABASE_URL is not set.')
    return new pg.Client({ connectionString, keepAlive: true })
}
