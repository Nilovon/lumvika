import { sql } from 'drizzle-orm'

import { settle, type DbResult } from './result'
import type { DbScope } from './scope'

function callOf(name: string, args: Record<string, unknown>) {
    const named = Object.entries(args)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => sql`${sql.identifier(key)} => ${value}`)
    return sql`${sql.identifier('public')}.${sql.identifier(name)}(${sql.join(named, sql`, `)})`
}

// A SQL function answering one value (`returns boolean`, `returns text`), called with named arguments.
export function callScalar<T>(scope: DbScope, name: string, args: Record<string, unknown> = {}): Promise<DbResult<T>> {
    return settle(() =>
        scope.run(async db => {
            const { rows } = await db.execute<{ result: T }>(sql`select ${callOf(name, args)} as result`)
            return rows[0].result
        })
    )
}

// A SQL function answering a set (`returns table (...)`, `returns setof ...`).
export function callRows<T extends Record<string, unknown>>(scope: DbScope, name: string, args: Record<string, unknown> = {}): Promise<DbResult<T[]>> {
    return settle(() =>
        scope.run(async db => {
            const { rows } = await db.execute<T>(sql`select * from ${callOf(name, args)}`)
            return rows as T[]
        })
    )
}
