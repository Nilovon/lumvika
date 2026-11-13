import { joinColumnsOf, NOT_ONE_ROW } from '@lumvika/db'

import type { DbScope, TableName } from '@/lib/db'

import { fakeScope } from '@/test/db-fake'

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

type Answer = { data: unknown; error: unknown }
type DbError = { code?: string; message: string }
type Write = { method: 'insert' | 'update' | 'upsert' | 'delete'; payload: unknown; filters: Row }
type Call = { helper: string; table: string; args: unknown[] }

export type WorkDatabaseOptions = {
    // A table whose every call fails with this error.
    refuse?: Record<string, DbError>
    // SQL functions reached through callRows, callScalar and callColumn, by name.
    rpc?: Record<string, (args: Row) => unknown>
    // What a raw `queryRows` answers.
    query?: (query: unknown) => unknown
    // Stands in for a trigger (the issue number): called on every inserted row.
    onInsert?: Record<string, (row: Row) => void>
    // Stands in for a unique index: an insert it finds a clash for fails the way Postgres does.
    unique?: Record<string, (row: Row, existing: Row) => boolean>
}

let nextId = 0

// Numbers by value, everything else (timestamps, text) as text, the way Postgres orders each.
function compare(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function likeToRegExp(pattern: string, flags: string): RegExp {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
    return new RegExp(`^${escaped}$`, flags)
}

// One filter value of `@lumvika/db` (see packages/db/src/filters.ts) against one cell.
function cellMatches(cell: unknown, value: unknown): boolean {
    if (Array.isArray(value)) return value.includes(cell)
    if (value === null || typeof value !== 'object') return cell === value
    const filter = value as Row
    if ('gt' in filter && !(cell != null && compare(cell, filter.gt) > 0)) return false
    if ('gte' in filter && !(cell != null && compare(cell, filter.gte) >= 0)) return false
    if ('lt' in filter && !(cell != null && compare(cell, filter.lt) < 0)) return false
    if ('lte' in filter && !(cell != null && compare(cell, filter.lte) <= 0)) return false
    if ('in' in filter) return (filter.in as unknown[]).includes(cell)
    if ('eq' in filter) return cell === filter.eq
    if ('neq' in filter) return cell != null && cell !== filter.neq
    if ('like' in filter) return typeof cell === 'string' && likeToRegExp(filter.like as string, '').test(cell)
    if ('ilike' in filter) return typeof cell === 'string' && likeToRegExp(filter.ilike as string, 'i').test(cell)
    if ('notNull' in filter) return cell != null
    if ('isNull' in filter) return cell == null
    return true
}

export function rowMatches(row: Row, filters: Row = {}): boolean {
    return Object.entries(filters).every(([key, value]) => {
        if (value === undefined) return true
        if (key === 'or' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
            const alternatives = Object.entries(value as Row).filter(([, alternative]) => alternative !== undefined)
            return alternatives.length === 0 || alternatives.some(([column, alternative]) => cellMatches(row[column], alternative))
        }
        return cellMatches(row[key], value)
    })
}

function ordered(rows: Row[], orderBy?: { column: string; ascending?: boolean }, limit?: number, offset?: number): Row[] {
    let result = rows
    if (orderBy) {
        const direction = orderBy.ascending === false ? -1 : 1
        result = [...rows].sort((a, b) => direction * compare(a[orderBy.column], b[orderBy.column]))
    }
    const start = offset ?? 0
    return limit === undefined ? result.slice(start) : result.slice(start, start + limit)
}

function picked(row: Row, columns: readonly string[]): Row {
    return Object.fromEntries(columns.map(column => [column, row[column] ?? null]))
}

type JoinConfig = { table: string; foreignKey: string; columns: readonly string[] }

function joinColumns(source: string, config: JoinConfig): { local: string[]; foreign: string[] } {
    const { localColumns, foreignColumns } = joinColumnsOf(source as TableName, config.foreignKey)
    return { local: localColumns, foreign: foreignColumns }
}

// An in-memory database behind the helpers of `@/lib/db`: reads filter `tables`, writes change it,
// and a write asked for its rows returns them. Every call and write is recorded.
//
//   vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))
//   const db = workDatabase({ issues: [issueRow()] })
//   await createIssue({ workspaceId: 7, db: db.scope }, ...)
//   expect(db.writes('issues')[0].payload).toMatchObject({ title: 'x' })
export function workDatabase(tables: Tables, options: WorkDatabaseOptions = {}) {
    const calls: Call[] = []
    const writeLog: (Write & { table: string })[] = []
    const scope: DbScope = fakeScope('service')

    const rowsOf = (table: string): Row[] => (tables[table] ??= [])
    const refusal = (table: string): Answer | null => {
        const error = options.refuse?.[table]
        return error ? { data: null, error } : null
    }

    function read(table: string, selection: readonly string[], filters: Row, orderBy?: { column: string; ascending?: boolean }, limit?: number, offset?: number): Row[] {
        return ordered(rowsOf(table).filter(row => rowMatches(row, filters)), orderBy, limit, offset).map(row => picked(row, selection))
    }

    function readJoined(table: string, selection: readonly string[], joins: Record<string, JoinConfig>, filters: Row, joinFilters: Record<string, Row> = {}, orderBy?: { column: string; ascending?: boolean }, limit?: number, offset?: number): Row[] {
        const sources = ordered(rowsOf(table).filter(row => rowMatches(row, filters)), orderBy)
        const joined = sources
            .map(row => {
                const result: Row = picked(row, selection)
                for (const [alias, config] of Object.entries(joins)) {
                    const { local, foreign } = joinColumns(table, config)
                    const target = rowsOf(config.table).find(candidate => foreign.every((column, index) => candidate[column] === row[local[index]]) && rowMatches(candidate, joinFilters[alias]))
                    result[alias] = target ? picked(target, config.columns) : null
                }
                return result
            })
            .filter(row => Object.keys(joinFilters).every(alias => row[alias] !== null))
        return ordered(joined, undefined, limit, offset)
    }

    function insert(table: string, values: Row | Row[], method: 'insert' | 'upsert' = 'insert'): Row[] | DbError {
        const payloads = ([] as Row[]).concat(values)
        const rows = rowsOf(table)
        const clashes = options.unique?.[table]
        if (method === 'insert' && clashes && payloads.some(payload => rows.some(existing => clashes(payload, existing)))) return { code: '23505', message: 'duplicate key value violates unique constraint' }
        const inserted = payloads.map(payload => ({ id: `${table}-${++nextId}`, created_at: new Date(Date.now() + nextId).toISOString(), ...payload }))
        for (const row of inserted) options.onInsert?.[table]?.(row)
        rows.push(...inserted)
        return inserted
    }

    const helpers = {
        async selectSingle(_scope: DbScope, table: string, selection: readonly string[], filters: Row, orderBy?: { column: string; ascending?: boolean }): Promise<Answer> {
            calls.push({ helper: 'selectSingle', table, args: [selection, filters, orderBy] })
            const refused = refusal(table)
            if (refused) return refused
            const rows = read(table, selection, filters, orderBy, 2)
            return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: NOT_ONE_ROW, message: `${rows.length} rows of ${table}` } }
        },
        async selectMaybeSingle(_scope: DbScope, table: string, selection: readonly string[], filters: Row, orderBy?: { column: string; ascending?: boolean }): Promise<Answer> {
            calls.push({ helper: 'selectMaybeSingle', table, args: [selection, filters, orderBy] })
            const refused = refusal(table)
            if (refused) return refused
            const rows = read(table, selection, filters, orderBy, 2)
            return rows.length > 1 ? { data: null, error: { code: NOT_ONE_ROW, message: `${rows.length} rows of ${table}` } } : { data: rows[0] ?? null, error: null }
        },
        async selectFirst(_scope: DbScope, table: string, selection: readonly string[], filters: Row, orderBy?: { column: string; ascending?: boolean }): Promise<Answer> {
            calls.push({ helper: 'selectFirst', table, args: [selection, filters, orderBy] })
            return refusal(table) ?? { data: read(table, selection, filters, orderBy, 1)[0] ?? null, error: null }
        },
        async selectMany(_scope: DbScope, table: string, selection: readonly string[], filters: Row, orderBy?: { column: string; ascending?: boolean }, limit?: number, offset?: number): Promise<Answer> {
            calls.push({ helper: 'selectMany', table, args: [selection, filters, orderBy, limit, offset] })
            return refusal(table) ?? { data: read(table, selection, filters, orderBy, limit, offset), error: null }
        },
        async selectAll(_scope: DbScope, table: string, selection: readonly string[], filters: Row, orderBy?: { column: string; ascending?: boolean }): Promise<Answer> {
            calls.push({ helper: 'selectAll', table, args: [selection, filters, orderBy] })
            return refusal(table) ?? { data: read(table, selection, filters, orderBy), error: null }
        },
        async selectCount(_scope: DbScope, table: string, filters: Row): Promise<Answer> {
            calls.push({ helper: 'selectCount', table, args: [filters] })
            return refusal(table) ?? { data: rowsOf(table).filter(row => rowMatches(row, filters)).length, error: null }
        },
        async selectSingleWithJoins(_scope: DbScope, table: string, selection: readonly string[], joins: Record<string, JoinConfig>, filters: Row, joinFilters?: Record<string, Row>, orderBy?: { column: string; ascending?: boolean }): Promise<Answer> {
            calls.push({ helper: 'selectSingleWithJoins', table, args: [selection, joins, filters, joinFilters, orderBy] })
            const refused = refusal(table)
            if (refused) return refused
            const rows = readJoined(table, selection, joins, filters, joinFilters, orderBy, 2)
            return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: NOT_ONE_ROW, message: `${rows.length} rows of ${table}` } }
        },
        async selectMaybeSingleWithJoins(_scope: DbScope, table: string, selection: readonly string[], joins: Record<string, JoinConfig>, filters: Row, joinFilters?: Record<string, Row>, orderBy?: { column: string; ascending?: boolean }): Promise<Answer> {
            calls.push({ helper: 'selectMaybeSingleWithJoins', table, args: [selection, joins, filters, joinFilters, orderBy] })
            return refusal(table) ?? { data: readJoined(table, selection, joins, filters, joinFilters, orderBy, 1)[0] ?? null, error: null }
        },
        async selectManyWithJoins(_scope: DbScope, table: string, selection: readonly string[], joins: Record<string, JoinConfig>, filters: Row, joinFilters?: Record<string, Row>, orderBy?: { column: string; ascending?: boolean }, limit?: number, offset?: number): Promise<Answer> {
            calls.push({ helper: 'selectManyWithJoins', table, args: [selection, joins, filters, joinFilters, orderBy, limit, offset] })
            return refusal(table) ?? { data: readJoined(table, selection, joins, filters, joinFilters, orderBy, limit, offset), error: null }
        },
        async insertRows(_scope: DbScope, table: string, values: Row | Row[], returning?: readonly string[]): Promise<Answer> {
            calls.push({ helper: 'insertRows', table, args: [values, returning] })
            writeLog.push({ table, method: 'insert', payload: values, filters: {} })
            const refused = refusal(table)
            if (refused) return refused
            const inserted = insert(table, values)
            if (!Array.isArray(inserted)) return { data: null, error: inserted }
            return { data: returning?.length ? inserted.map(row => picked(row, returning)) : [], error: null }
        },
        async insertRow(_scope: DbScope, table: string, value: Row, returning: readonly string[]): Promise<Answer> {
            calls.push({ helper: 'insertRow', table, args: [value, returning] })
            writeLog.push({ table, method: 'insert', payload: value, filters: {} })
            const refused = refusal(table)
            if (refused) return refused
            const inserted = insert(table, value)
            if (!Array.isArray(inserted)) return { data: null, error: inserted }
            return { data: picked(inserted[0], returning), error: null }
        },
        async updateRows(_scope: DbScope, table: string, patch: Row, filters: Row, returning?: readonly string[]): Promise<Answer> {
            calls.push({ helper: 'updateRows', table, args: [patch, filters, returning] })
            writeLog.push({ table, method: 'update', payload: patch, filters })
            const refused = refusal(table)
            if (refused) return refused
            const changed = rowsOf(table).filter(row => rowMatches(row, filters))
            for (const row of changed) Object.assign(row, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)))
            return { data: returning?.length ? changed.map(row => picked(row, returning)) : [], error: null }
        },
        async deleteRows(_scope: DbScope, table: string, filters: Row, returning?: readonly string[]): Promise<Answer> {
            calls.push({ helper: 'deleteRows', table, args: [filters, returning] })
            writeLog.push({ table, method: 'delete', payload: undefined, filters })
            const refused = refusal(table)
            if (refused) return refused
            const removed = rowsOf(table).filter(row => rowMatches(row, filters))
            tables[table] = rowsOf(table).filter(row => !rowMatches(row, filters))
            return { data: returning?.length ? removed.map(row => picked(row, returning)) : [], error: null }
        },
        async upsertRows(_scope: DbScope, table: string, values: Row | Row[], upsert: { onConflict: readonly string[]; ignoreDuplicates?: boolean; update?: readonly string[]; returning?: readonly string[] }): Promise<Answer> {
            calls.push({ helper: 'upsertRows', table, args: [values, upsert] })
            writeLog.push({ table, method: 'upsert', payload: values, filters: {} })
            const refused = refusal(table)
            if (refused) return refused
            const result: Row[] = []
            for (const value of ([] as Row[]).concat(values)) {
                const existing = rowsOf(table).find(row => upsert.onConflict.every(column => row[column] === value[column]))
                if (existing) {
                    if (!upsert.ignoreDuplicates) {
                        const columns = upsert.update ?? Object.keys(value).filter(column => !upsert.onConflict.includes(column))
                        for (const column of columns) existing[column] = value[column]
                        result.push(existing)
                    }
                    continue
                }
                const inserted = insert(table, value, 'upsert')
                if (Array.isArray(inserted)) result.push(...inserted)
            }
            return { data: upsert.returning?.length ? result.map(row => picked(row, upsert.returning!)) : [], error: null }
        },
        async callRows(_scope: DbScope, name: string, args: Row = {}): Promise<Answer> {
            calls.push({ helper: 'callRows', table: name, args: [args] })
            return refusal(name) ?? { data: options.rpc?.[name]?.(args) ?? [], error: null }
        },
        async callScalar(_scope: DbScope, name: string, args: Row = {}): Promise<Answer> {
            calls.push({ helper: 'callScalar', table: name, args: [args] })
            return refusal(name) ?? { data: options.rpc?.[name]?.(args) ?? null, error: null }
        },
        async callColumn(_scope: DbScope, name: string, args: Row = {}): Promise<Answer> {
            calls.push({ helper: 'callColumn', table: name, args: [args] })
            return refusal(name) ?? { data: options.rpc?.[name]?.(args) ?? [], error: null }
        },
        async queryRows(_scope: DbScope, query: unknown): Promise<Answer> {
            calls.push({ helper: 'queryRows', table: 'sql', args: [query] })
            return { data: options.query?.(query) ?? [], error: null }
        },
    }

    const database = {
        tables,
        scope,
        calls,
        helpers,
        // The calls one helper made, on one table (or SQL function) when given.
        callsTo: (helper: string, table?: string) => calls.filter(call => call.helper === helper && (table === undefined || call.table === table)),
        // The payload of every insert, update and upsert, and every delete, made on `table`, in order.
        writes: (table: string) => writeLog.filter(write => write.table === table).map(({ method, payload, filters }) => ({ method, payload, filters })),
    }
    current = database
    return database
}

export type WorkDatabase = ReturnType<typeof workDatabase>

let current: WorkDatabase | null = null

function currentDatabase(): WorkDatabase {
    if (!current) throw new Error('work-fake: call workDatabase(...) before the code under test reaches the database.')
    return current
}

// The helpers of `@/lib/db`, answered by the database the last `workDatabase(...)` call built. Spread
// them into `vi.mock('@/lib/db', ...)`.
export const workDbHelpers = Object.fromEntries(
    (['selectSingle', 'selectMaybeSingle', 'selectFirst', 'selectMany', 'selectAll', 'selectCount', 'selectSingleWithJoins', 'selectMaybeSingleWithJoins', 'selectManyWithJoins', 'insertRows', 'insertRow', 'updateRows', 'deleteRows', 'upsertRows', 'callRows', 'callScalar', 'callColumn', 'queryRows'] as const).map(name => [
        name,
        (...args: unknown[]) => (currentDatabase().helpers[name] as (...inner: unknown[]) => Promise<Answer>)(...args),
    ]),
)
