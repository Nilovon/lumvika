import { fakeSupabase, writeMethodOf, type FakeSupabase, type SupabaseCall, type SupabaseResult } from '@/test/supabase-fake'

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

let nextId = 0

// Numbers by value, everything else (timestamps, text) as text, the way Postgres orders each.
function compare(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

// The value a column must hold for every builder filter of the chain, the way PostgREST reads them.
function matches(row: Row, calls: readonly SupabaseCall[]): boolean {
    return calls.every(call => {
        const [column, value, extra] = call.args as [string, unknown, unknown]
        switch (call.method) {
            case 'eq':
                return row[column] === value
            case 'neq':
                return row[column] !== value
            case 'in':
                return (value as unknown[]).includes(row[column])
            case 'is':
                return row[column] == null
            case 'not':
                return value === 'is' && extra === null ? row[column] != null : true
            case 'lt':
                return row[column] != null && compare(row[column], value) < 0
            case 'gt':
                return row[column] != null && compare(row[column], value) > 0
            case 'gte':
                return row[column] != null && compare(row[column], value) >= 0
            case 'lte':
                return row[column] != null && compare(row[column], value) <= 0
            default:
                return true
        }
    })
}

function ordered(rows: Row[], calls: readonly SupabaseCall[]): Row[] {
    const order = calls.find(call => call.method === 'order')
    let result = rows
    if (order) {
        const [column, options] = order.args as [string, { ascending?: boolean }]
        const direction = options?.ascending === false ? -1 : 1
        result = [...rows].sort((a, b) => ((a[column] as number | string) > (b[column] as number | string) ? direction : (a[column] as number | string) < (b[column] as number | string) ? -direction : 0))
    }
    const range = calls.find(call => call.method === 'range')
    if (range) {
        const [from, to] = range.args as [number, number]
        return result.slice(from, to + 1)
    }
    const limit = calls.find(call => call.method === 'limit')
    return limit ? result.slice(0, limit.args[0] as number) : result
}

// Embeds `alias:table!fk(columns)` the way PostgREST does for a many-to-one join on `<alias>_id`.
function withJoins(row: Row, calls: readonly SupabaseCall[], tables: Tables): Row {
    const select = calls.find(call => call.method === 'select')
    const selection = typeof select?.args[0] === 'string' ? select.args[0] : ''
    const joined = { ...row }
    for (const match of selection.matchAll(/(\w+):(\w+)!\w+\(([^)]*)\)/g)) {
        const [, alias, table] = match
        joined[alias] = (tables[table] ?? []).find(candidate => candidate.id === row[`${alias}_id`]) ?? null
    }
    return joined
}

function single(calls: readonly SupabaseCall[]): boolean {
    return calls.some(call => call.method === 'maybeSingle' || call.method === 'single')
}

// An in-memory database behind the fake client: reads filter `tables`, writes change it, and a
// write that selects its rows back returns them. `refuse` makes the chains on a table fail, and
// `onInsert` stands in for a trigger (the issue number), `unique` for a unique index: an insert it
// finds a clash for fails the way Postgres does.
export function workDatabase(
    tables: Tables,
    options: { refuse?: Record<string, { code?: string; message: string }>; rpc?: Record<string, (args: Row) => unknown>; onInsert?: Record<string, (row: Row) => void>; unique?: Record<string, (row: Row, existing: Row) => boolean> } = {},
): FakeSupabase {
    return fakeSupabase((table, calls): SupabaseResult | undefined => {
        if (table.startsWith('rpc:')) return { data: options.rpc?.[table.slice(4)]?.((calls[0].args[1] ?? {}) as Row) ?? null }
        const refusal = options.refuse?.[table]
        if (refusal) return { error: refusal, data: null }
        const rows = (tables[table] ??= [])
        const write = writeMethodOf(calls)
        const returning = calls.some(call => call.method === 'select')
        const writeCall = calls.find(call => call.method === write)

        if (write === 'insert' || write === 'upsert') {
            const payloads = ([] as Row[]).concat(writeCall?.args[0] as Row | Row[])
            const clashes = options.unique?.[table]
            if (write === 'insert' && clashes && payloads.some(payload => rows.some(existing => clashes(payload, existing)))) return { error: { code: '23505', message: 'duplicate key value violates unique constraint' }, data: null }
            const inserted = payloads.map(payload => ({ id: `${table}-${++nextId}`, created_at: new Date(Date.now() + nextId).toISOString(), ...payload }))
            for (const row of inserted) options.onInsert?.[table]?.(row)
            rows.push(...inserted)
            if (!returning) return {}
            return { data: single(calls) ? inserted[0] : inserted }
        }
        if (write === 'update') {
            const changed = rows.filter(row => matches(row, calls))
            for (const row of changed) Object.assign(row, writeCall?.args[0] as Row)
            if (!returning) return {}
            return { data: single(calls) ? (changed[0] ?? null) : changed }
        }
        if (write === 'delete') {
            tables[table] = rows.filter(row => !matches(row, calls))
            return {}
        }

        const found = ordered(rows.filter(row => matches(row, calls)), calls).map(row => withJoins(row, calls, tables))
        const select = calls.find(call => call.method === 'select')
        if ((select?.args[1] as { head?: boolean } | undefined)?.head) return { count: found.length }
        return { data: single(calls) ? (found[0] ?? null) : found }
    })
}
