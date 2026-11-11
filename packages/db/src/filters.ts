import { and, eq, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, ne, or, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import type { TableName, TableRow } from './tables'

// A bare null is not a filter: say `{ isNull: true }`.
export type FilterValue<T> = T | T[] | { in: T[] } | { eq: T } | { neq: T } | { gt: T } | { gte: T } | { lt: T } | { lte: T } | { like: string } | { ilike: string } | { notNull: true } | { isNull: true }

// Columns listed inside `or` are combined with OR, the rest of the filters stay ANDed:
// `{ enabled: true, or: { name: { ilike }, slug: { ilike } } }` is enabled AND (name OR slug).
export type OrFilters<T extends TableName> = {
    [K in keyof TableRow<T>]?: FilterValue<TableRow<T>[K]>
}

export type Filters<T extends TableName> = OrFilters<T> & { or?: OrFilters<T> }

export type OrderBy<T extends TableName> = { column: keyof TableRow<T> & string; ascending?: boolean }

export function columnOf(table: PgTable, name: string): PgColumn {
    const column = (table as unknown as Record<string, PgColumn | undefined>)[name]
    if (!column) throw new Error(`Unknown column: ${name}`)
    return column
}

function conditionsFor(column: PgColumn, value: unknown): SQL[] {
    if (Array.isArray(value)) return [inArray(column, value)]
    if (value === null || typeof value !== 'object') return [eq(column, value)]

    const filter = value as Record<string, unknown>
    // The range bounds apply together, so `{ gte, lte }` keeps both ends.
    const conditions: SQL[] = []
    if ('gt' in filter) conditions.push(gt(column, filter.gt))
    if ('gte' in filter) conditions.push(gte(column, filter.gte))
    if ('lt' in filter) conditions.push(lt(column, filter.lt))
    if ('lte' in filter) conditions.push(lte(column, filter.lte))
    if ('in' in filter) conditions.push(inArray(column, filter.in as unknown[]))
    else if ('eq' in filter) conditions.push(eq(column, filter.eq))
    else if ('neq' in filter) conditions.push(ne(column, filter.neq))
    else if ('like' in filter) conditions.push(like(column, filter.like as string))
    else if ('ilike' in filter) conditions.push(ilike(column, filter.ilike as string))
    else if ('notNull' in filter) conditions.push(isNotNull(column))
    else if ('isNull' in filter) conditions.push(isNull(column))
    return conditions
}

export function whereOf(table: PgTable, filters: Record<string, unknown>): SQL | undefined {
    const conditions: SQL[] = []
    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined) continue
        if (key === 'or' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
            const alternatives = Object.entries(value as Record<string, unknown>)
                .filter(([, alternative]) => alternative !== undefined)
                .map(([name, alternative]) => and(...conditionsFor(columnOf(table, name), alternative)))
                .filter((condition): condition is SQL => condition !== undefined)
            if (alternatives.length > 0) conditions.push(or(...alternatives)!)
            continue
        }
        conditions.push(...conditionsFor(columnOf(table, key), value))
    }
    return conditions.length > 0 ? and(...conditions) : undefined
}

export function hasFilters(filters: Record<string, unknown>): boolean {
    return Object.values(filters).some(value => value !== undefined)
}
