import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/app/api/database.types'

export type SupabaseCall = { table: string; method: string; args: unknown[] }
export type SupabaseResult = { data?: unknown; error?: unknown; count?: number | null }

// What one chain resolves to, given the table it started on and every call made along it. A chain
// is `from(table)` followed by any builder methods, awaited once: `.eq().select().single()` and
// friends all land on the same answer, so a resolver switches on `table` and, when it has to, on
// the first write method in `calls`.
export type SupabaseResolver = (table: string, calls: readonly SupabaseCall[]) => SupabaseResult | undefined

const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete'])

// A Supabase client that records every builder call instead of reaching a database. The helpers in
// @rerun/db and the raw writes both go through `from(...)`, so the same fake serves a test of the
// read helpers themselves and a test asserting what a service writes.
export function fakeSupabase(resolve: SupabaseResolver = () => undefined) {
    const calls: SupabaseCall[] = []
    const chains: SupabaseCall[][] = []

    function chain(table: string, first: SupabaseCall) {
        const own: SupabaseCall[] = [first]
        chains.push(own)
        calls.push(first)
        const builder: object = new Proxy(
            {},
            {
                get(_target, prop) {
                    if (prop === 'then') {
                        const result = { data: null, error: null, count: null, ...resolve(table, own) }
                        return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected)
                    }
                    return (...args: unknown[]) => {
                        const call = { table, method: String(prop), args }
                        own.push(call)
                        calls.push(call)
                        return builder
                    }
                },
            },
        )
        return builder
    }

    const client = {
        from: (table: string) => chain(table, { table, method: 'from', args: [table] }),
        rpc: (fn: string, args?: unknown) => chain(`rpc:${fn}`, { table: `rpc:${fn}`, method: 'rpc', args: [fn, args] }),
    }

    return {
        client: client as unknown as SupabaseClient<Database>,
        calls,
        chains,
        // The calls of every chain started on `table`, in order.
        chainsOn: (table: string) => chains.filter(own => own[0].table === table),
        // The payload of every insert/update/upsert, and a `delete` marker, made on `table`.
        writes: (table: string) =>
            chains
                .filter(own => own[0].table === table)
                .flatMap(own => own.filter(call => WRITE_METHODS.has(call.method)).map(call => ({ method: call.method, payload: call.args[0], filters: own.filter(c => c.method !== 'from' && !WRITE_METHODS.has(c.method)) }))),
    }
}

export type FakeSupabase = ReturnType<typeof fakeSupabase>

// The first write method of a chain, or null for a read.
export function writeMethodOf(calls: readonly SupabaseCall[]): string | null {
    return calls.find(call => WRITE_METHODS.has(call.method))?.method ?? null
}
