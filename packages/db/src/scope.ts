import { sql, type ExtractTablesWithRelations } from 'drizzle-orm'
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgTransaction } from 'drizzle-orm/pg-core'

import { getDb, type Db, type Schema } from './pool'

export type Tx = PgTransaction<NodePgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>
export type Executor = Db | Tx

export type ScopeKind = 'service' | 'anon' | 'user'

// Who a query runs as. `service` is the connection's own role and passes every policy, `anon` and
// `user` switch to the roles the policies are written for, for one transaction at a time, so the
// role and the user id never outlive it on a pooled connection.
export type DbScope = {
    readonly kind: ScopeKind
    readonly userId: string | null
    run<T>(work: (db: Executor) => Promise<T>): Promise<T>
}

const USER_ID_SETTING = 'lumvika.user_id'

function inRole(role: 'anon' | 'authenticated', userId: string | null) {
    return <T>(work: (db: Executor) => Promise<T>): Promise<T> =>
        getDb().transaction(async tx => {
            await tx.execute(sql`select set_config('role', ${role}, true), set_config(${USER_ID_SETTING}, ${userId ?? ''}, true)`)
            return work(tx)
        })
}

export function serviceScope(): DbScope {
    return { kind: 'service', userId: null, run: work => work(getDb()) }
}

export function anonScope(): DbScope {
    return { kind: 'anon', userId: null, run: inRole('anon', null) }
}

export function userScope(userId: string): DbScope {
    return { kind: 'user', userId, run: inRole('authenticated', userId) }
}

// Several statements that must land together: every helper given the scope it hands over runs in
// the one transaction, as the same role.
export async function inTransaction<T>(scope: DbScope, work: (scope: DbScope) => Promise<T>): Promise<T> {
    const open = scope.kind === 'service' ? <R>(inner: (db: Executor) => Promise<R>) => getDb().transaction(tx => inner(tx)) : scope.run
    return open(async tx => work({ kind: scope.kind, userId: scope.userId, run: inner => inner(tx) }))
}
