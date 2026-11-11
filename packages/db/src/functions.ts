import { sql, type SQL } from 'drizzle-orm'

import { settle, type DbResult } from './result'
import { toIsoTimestamp } from './schema/columns'
import type { DbScope } from './scope'

const POSTGRES_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$/

// Raw SQL skips the column mappers, so a timestamptz comes back as `2026-11-11 10:00:00+00`; the
// app reads ISO 8601, as the typed selects give it.
function normalized(value: unknown): unknown {
    if (typeof value === 'string' && POSTGRES_TIMESTAMP.test(value)) return toIsoTimestamp(value)
    if (Array.isArray(value)) return value.map(normalized)
    return value
}

function normalizedRow<T>(row: Record<string, unknown>): T {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalized(value)])) as T
}

// Any SQL the helpers do not cover, as rows: int8 as numbers, timestamps in ISO 8601.
export function queryRows<T extends Record<string, unknown>>(scope: DbScope, query: SQL): Promise<DbResult<T[]>> {
    return settle(() =>
        scope.run(async db => {
            const { rows } = await db.execute(query)
            return rows.map(row => normalizedRow<T>(row as Record<string, unknown>))
        }),
    )
}

// An array goes over as one parameter, the Postgres array the function takes; interpolated as is,
// Drizzle would spread it into a list of parameters.
function callOf(name: string, args: Record<string, unknown>) {
    const named = Object.entries(args)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => sql`${sql.identifier(key)} => ${Array.isArray(value) ? sql.param(value) : value}`)
    return sql`${sql.identifier('public')}.${sql.identifier(name)}(${sql.join(named, sql`, `)})`
}

// A SQL function answering one value (`returns boolean`, `returns text`), called with named arguments.
export async function callScalar<T>(scope: DbScope, name: string, args: Record<string, unknown> = {}): Promise<DbResult<T>> {
    const result = await queryRows<{ result: T }>(scope, sql`select ${callOf(name, args)} as result`)
    return result.error ? result : { data: result.data[0].result, error: null }
}

// A SQL function answering rows (`returns table (...)`, `returns setof <composite>`).
export function callRows<T extends Record<string, unknown>>(scope: DbScope, name: string, args: Record<string, unknown> = {}): Promise<DbResult<T[]>> {
    return queryRows<T>(scope, sql`select * from ${callOf(name, args)}`)
}

// A SQL function answering a set of plain values (`returns setof uuid`), as the bare array.
export async function callColumn<T>(scope: DbScope, name: string, args: Record<string, unknown> = {}): Promise<DbResult<T[]>> {
    const result = await queryRows<{ value: T }>(scope, sql`select value from ${callOf(name, args)} as value`)
    return result.error ? result : { data: result.data.map(row => row.value), error: null }
}
