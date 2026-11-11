import { asc, count, desc, getTableName } from 'drizzle-orm'
import { getTableConfig, type PgColumn, type PgTable } from 'drizzle-orm/pg-core'

import { columnOf, whereOf, type Filters, type OrderBy } from './filters'
import { NOT_ONE_ROW, settle, type DbResult } from './result'
import type { DbScope } from './scope'
import { tableOf, type TableName, type TableRow } from './tables'

export type { FilterValue, Filters, OrFilters, OrderBy } from './filters'
export type { DbError, DbResult } from './result'
export type { TableName, TableRow } from './tables'

type Picked<T extends TableName, S extends readonly (keyof TableRow<T>)[]> = Pick<TableRow<T>, S[number]>

function selectionOf(table: PgTable, columns: readonly string[]): Record<string, PgColumn> {
    return Object.fromEntries(columns.map(name => [name, columnOf(table, name)]))
}

type ReadOptions<T extends TableName> = { orderBy?: OrderBy<T>; limit?: number; offset?: number }

function readRows<T extends TableName>(scope: DbScope, name: T, columns: readonly string[], filters: Filters<T>, { orderBy, limit, offset }: ReadOptions<T>) {
    const table = tableOf(name) as PgTable
    return scope.run(async db => {
        let query = db
            .select(selectionOf(table, columns))
            .from(table)
            .where(whereOf(table, filters as Record<string, unknown>))
            .$dynamic()
        if (orderBy) {
            const column = columnOf(table, orderBy.column)
            query = query.orderBy(orderBy.ascending === false ? desc(column) : asc(column))
        }
        if (limit !== undefined) query = query.limit(limit)
        if (offset !== undefined) query = query.offset(offset)
        return (await query) as Record<string, unknown>[]
    })
}

function exactlyOne<R>(rows: R[], table: string): R {
    if (rows.length !== 1) throw Object.assign(new Error(`Expected one row from ${table}, got ${rows.length}.`), { code: NOT_ONE_ROW })
    return rows[0]
}

export function selectSingle<T extends TableName, const S extends readonly (keyof TableRow<T> & string)[]>(scope: DbScope, table: T, selection: S, filters: Filters<T>, orderBy?: OrderBy<T>): Promise<DbResult<Picked<T, S>>> {
    return settle(async () => exactlyOne(await readRows(scope, table, selection, filters, { orderBy, limit: 2 }), table) as Picked<T, S>)
}

export function selectMaybeSingle<T extends TableName, const S extends readonly (keyof TableRow<T> & string)[]>(scope: DbScope, table: T, selection: S, filters: Filters<T>, orderBy?: OrderBy<T>): Promise<DbResult<Picked<T, S> | null>> {
    return settle(async () => {
        const rows = await readRows(scope, table, selection, filters, { orderBy, limit: 2 })
        return rows.length === 0 ? null : (exactlyOne(rows, table) as Picked<T, S>)
    })
}

export function selectFirst<T extends TableName, const S extends readonly (keyof TableRow<T> & string)[]>(scope: DbScope, table: T, selection: S, filters: Filters<T>, orderBy?: OrderBy<T>): Promise<DbResult<Picked<T, S> | null>> {
    return settle(async () => ((await readRows(scope, table, selection, filters, { orderBy, limit: 1 }))[0] as Picked<T, S> | undefined) ?? null)
}

export function selectMany<T extends TableName, const S extends readonly (keyof TableRow<T> & string)[]>(scope: DbScope, table: T, selection: S, filters: Filters<T>, orderBy?: OrderBy<T>, limit?: number, offset?: number): Promise<DbResult<Picked<T, S>[]>> {
    return settle(async () => (await readRows(scope, table, selection, filters, { orderBy, limit: offset !== undefined ? (limit ?? 50) : limit, offset })) as Picked<T, S>[])
}

export function selectAll<T extends TableName, const S extends readonly (keyof TableRow<T> & string)[]>(scope: DbScope, table: T, selection: S, filters: Filters<T>, orderBy?: OrderBy<T>): Promise<DbResult<Picked<T, S>[]>> {
    return selectMany(scope, table, selection, filters, orderBy)
}

export function selectCount<T extends TableName>(scope: DbScope, name: T, filters: Filters<T>): Promise<DbResult<number>> {
    const table = tableOf(name) as PgTable
    return settle(() =>
        scope.run(async db => {
            const [row] = await db
                .select({ total: count() })
                .from(table)
                .where(whereOf(table, filters as Record<string, unknown>))
            return row?.total ?? 0
        })
    )
}

// A row of another table this one points at, read by the foreign key named in `foreignKey`: the
// target table's name, or `table!constraint` when the table is pointed at by more than one key.
export type JoinConfig<TJ extends TableName, Cols extends readonly (keyof TableRow<TJ>)[]> = {
    table: TJ
    foreignKey: string
    columns: Cols
}

type AnyJoins = Record<string, JoinConfig<any, readonly any[]>>

export type WithJoins<J extends AnyJoins> = {
    [K in keyof J]: J[K] extends JoinConfig<infer TJ, infer Cols> ? Pick<TableRow<TJ>, Cols[number]> : never
}

export type JoinFilters<J extends AnyJoins> = {
    [K in keyof J]?: J[K] extends JoinConfig<infer TJ, any> ? Filters<TJ> : never
}

type ResolvedJoin = { alias: string; target: PgTable; localColumns: string[]; foreignColumns: string[]; columns: string[]; filters?: Record<string, unknown> }

function propertyOf(table: PgTable, column: PgColumn): string {
    const entry = Object.entries(table as unknown as Record<string, unknown>).find(([, value]) => value === column)
    if (!entry) throw new Error(`Column ${column.name} is not on ${getTableName(table)}.`)
    return entry[0]
}

function resolveJoin(source: PgTable, alias: string, config: JoinConfig<any, readonly any[]>, filters?: Record<string, unknown>): ResolvedJoin {
    const [targetName, constraint] = config.foreignKey.split('!')
    const candidates = getTableConfig(source).foreignKeys.filter(foreignKey => {
        const reference = foreignKey.reference()
        return getTableName(reference.foreignTable) === targetName && (!constraint || foreignKey.getName() === constraint)
    })
    if (candidates.length !== 1) throw new Error(`Join ${alias}: ${candidates.length} foreign keys of ${getTableName(source)} match ${config.foreignKey}.`)
    const reference = candidates[0].reference()
    return {
        alias,
        target: reference.foreignTable,
        localColumns: reference.columns.map(column => propertyOf(source, column)),
        foreignColumns: reference.foreignColumns.map(column => propertyOf(reference.foreignTable, column)),
        columns: config.columns as string[],
        filters,
    }
}

const keyOf = (row: Record<string, unknown>, columns: string[]) => JSON.stringify(columns.map(column => row[column]))

// One query per join, like the embedding PostgREST did: a row whose join has no match gets null,
// and is dropped when that join carries filters.
async function attachJoins(scope: DbScope, rows: Record<string, unknown>[], joins: ResolvedJoin[]) {
    let kept = rows
    for (const join of joins) {
        const firstLocal = join.localColumns[0]
        const values = [...new Set(kept.map(row => row[firstLocal]).filter(value => value !== null && value !== undefined))]
        const readColumns = [...new Set([...join.columns, ...join.foreignColumns])]
        const targets =
            values.length === 0
                ? []
                : await scope.run(
                      async db =>
                          (await db
                              .select(selectionOf(join.target, readColumns))
                              .from(join.target)
                              .where(whereOf(join.target, { ...join.filters, [join.foreignColumns[0]]: { in: values } }))) as Record<string, unknown>[]
                  )
        const byKey = new Map(targets.map(target => [keyOf(target, join.foreignColumns), target]))
        kept = kept
            .map(row => {
                const target = byKey.get(keyOf(row, join.localColumns))
                return { ...row, [join.alias]: target ? Object.fromEntries(join.columns.map(column => [column, target[column]])) : null }
            })
            .filter(row => !join.filters || row[join.alias] !== null)
    }
    return kept
}

function readWithJoins<T extends TableName>(scope: DbScope, name: T, selection: readonly string[], joins: AnyJoins, filters: Filters<T>, joinFilters: Record<string, unknown> | undefined, options: ReadOptions<T>) {
    const source = tableOf(name) as PgTable
    const resolved = Object.entries(joins).map(([alias, config]) => resolveJoin(source, alias, config, joinFilters?.[alias] as Record<string, unknown> | undefined))
    const localColumns = [...new Set([...selection, ...resolved.flatMap(join => join.localColumns)])]
    return readRows(scope, name, localColumns, filters, options).then(rows => attachJoins(scope, rows, resolved).then(joined => joined.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => selection.includes(key) || key in joins)))))
}

export function selectSingleWithJoins<T extends TableName, const S extends readonly (keyof TableRow<T> & string)[], const J extends AnyJoins>(scope: DbScope, table: T, selection: S, joins: J, filters: Filters<T>, joinFilters?: JoinFilters<J>, orderBy?: OrderBy<T>): Promise<DbResult<Picked<T, S> & WithJoins<J>>> {
    return settle(async () => exactlyOne(await readWithJoins(scope, table, selection, joins, filters, joinFilters, { orderBy, limit: 2 }), table) as Picked<T, S> & WithJoins<J>)
}

export function selectMaybeSingleWithJoins<T extends TableName, const S extends readonly (keyof TableRow<T> & string)[], const J extends AnyJoins>(scope: DbScope, table: T, selection: S, joins: J, filters: Filters<T>, joinFilters?: JoinFilters<J>, orderBy?: OrderBy<T>): Promise<DbResult<(Picked<T, S> & WithJoins<J>) | null>> {
    return settle(async () => {
        const rows = await readWithJoins(scope, table, selection, joins, filters, joinFilters, { orderBy, limit: 2 })
        return rows.length === 0 ? null : (exactlyOne(rows, table) as Picked<T, S> & WithJoins<J>)
    })
}

export function selectManyWithJoins<T extends TableName, const S extends readonly (keyof TableRow<T> & string)[], const J extends AnyJoins>(scope: DbScope, table: T, selection: S, joins: J, filters: Filters<T>, joinFilters?: JoinFilters<J>, orderBy?: OrderBy<T>, limit?: number, offset?: number): Promise<DbResult<(Picked<T, S> & WithJoins<J>)[]>> {
    return settle(async () => (await readWithJoins(scope, table, selection, joins, filters, joinFilters, { orderBy, limit: offset !== undefined ? (limit ?? 50) : limit, offset })) as (Picked<T, S> & WithJoins<J>)[])
}
