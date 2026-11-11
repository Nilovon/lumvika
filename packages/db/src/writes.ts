import { sql } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import { columnOf, hasFilters, whereOf, type Filters } from './filters'
import { NOT_ONE_ROW, settle, type DbResult } from './result'
import type { DbScope } from './scope'
import { tableOf, type TableInsert, type TableName, type TableRow, type TableUpdate } from './tables'

type Returning<T extends TableName> = readonly (keyof TableRow<T> & string)[]
type Picked<T extends TableName, R extends Returning<T>> = Pick<TableRow<T>, R[number]>

function returningOf(table: PgTable, columns: readonly string[]): Record<string, PgColumn> {
    return Object.fromEntries(columns.map(name => [name, columnOf(table, name)]))
}

function requireFilters(table: string, filters: Record<string, unknown>) {
    // A write without a filter would touch every row: always a bug, never a request.
    if (!hasFilters(filters)) throw new Error(`Refusing to write every row of ${table}: give a filter.`)
}

export function insertRows<T extends TableName, const R extends Returning<T> = []>(scope: DbScope, name: T, values: TableInsert<T> | TableInsert<T>[], returning?: R): Promise<DbResult<Picked<T, R>[]>> {
    const table = tableOf(name) as PgTable
    const rows = Array.isArray(values) ? values : [values]
    return settle(() =>
        scope.run(async db => {
            if (rows.length === 0) return []
            const query = db.insert(table).values(rows as never)
            return (returning?.length ? await query.returning(returningOf(table, returning)) : (await query, [])) as Picked<T, R>[]
        })
    )
}

export function insertRow<T extends TableName, const R extends Returning<T>>(scope: DbScope, name: T, value: TableInsert<T>, returning: R): Promise<DbResult<Picked<T, R>>> {
    return settle(async () => {
        const { data, error } = await insertRows(scope, name, value, returning)
        if (error) throw Object.assign(new Error(error.message), error)
        if (data.length !== 1) throw Object.assign(new Error(`Expected one row inserted into ${name}.`), { code: NOT_ONE_ROW })
        return data[0]
    })
}

export function updateRows<T extends TableName, const R extends Returning<T> = []>(scope: DbScope, name: T, patch: TableUpdate<T>, filters: Filters<T>, returning?: R): Promise<DbResult<Picked<T, R>[]>> {
    const table = tableOf(name) as PgTable
    return settle(() =>
        scope.run(async db => {
            requireFilters(name, filters as Record<string, unknown>)
            const query = db
                .update(table)
                .set(patch as never)
                .where(whereOf(table, filters as Record<string, unknown>))
            return (returning?.length ? await query.returning(returningOf(table, returning)) : (await query, [])) as Picked<T, R>[]
        })
    )
}

export function deleteRows<T extends TableName, const R extends Returning<T> = []>(scope: DbScope, name: T, filters: Filters<T>, returning?: R): Promise<DbResult<Picked<T, R>[]>> {
    const table = tableOf(name) as PgTable
    return settle(() =>
        scope.run(async db => {
            requireFilters(name, filters as Record<string, unknown>)
            const query = db.delete(table).where(whereOf(table, filters as Record<string, unknown>))
            return (returning?.length ? await query.returning(returningOf(table, returning)) : (await query, [])) as Picked<T, R>[]
        })
    )
}

type UpsertOptions<T extends TableName, R extends Returning<T>> = {
    onConflict: readonly (keyof TableRow<T> & string)[]
    // Keep the row already there instead of overwriting it.
    ignoreDuplicates?: boolean
    // The columns an existing row takes from the new one; every column given by default.
    update?: readonly (keyof TableRow<T> & string)[]
    returning?: R
}

export function upsertRows<T extends TableName, const R extends Returning<T> = []>(scope: DbScope, name: T, values: TableInsert<T> | TableInsert<T>[], options: UpsertOptions<T, R>): Promise<DbResult<Picked<T, R>[]>> {
    const table = tableOf(name) as PgTable
    const rows = (Array.isArray(values) ? values : [values]) as Record<string, unknown>[]
    return settle(() =>
        scope.run(async db => {
            if (rows.length === 0) return []
            const target = options.onConflict.map(column => columnOf(table, column))
            const insert = db.insert(table).values(rows as never)
            const updated = options.update ?? Object.keys(rows[0]).filter(column => !options.onConflict.includes(column as never))
            const query =
                options.ignoreDuplicates || updated.length === 0
                    ? insert.onConflictDoNothing({ target })
                    : insert.onConflictDoUpdate({
                          target,
                          set: Object.fromEntries(updated.map(column => [column, excludedOf(columnOf(table, column))])) as never,
                      })
            return (options.returning?.length ? await query.returning(returningOf(table, options.returning)) : (await query, [])) as Picked<T, R>[]
        })
    )
}

function excludedOf(column: PgColumn) {
    return sql.raw(`excluded."${column.name}"`)
}
