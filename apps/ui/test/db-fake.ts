import type { DbScope } from '@/lib/db'

export const HELPERS = [
    'selectSingle',
    'selectMaybeSingle',
    'selectFirst',
    'selectMany',
    'selectAll',
    'selectCount',
    'selectSingleWithJoins',
    'selectMaybeSingleWithJoins',
    'selectManyWithJoins',
    'insertRows',
    'insertRow',
    'updateRows',
    'deleteRows',
    'upsertRows',
    'callScalar',
    'callRows',
    'callColumn',
    'queryRows',
] as const

export type DbHelper = (typeof HELPERS)[number]

// One helper call: the helper's name, the table (or SQL function) it named, and every argument
// after the scope, as passed.
export type DbCall = { helper: DbHelper; table: string; args: unknown[]; scope: DbScope }
export type DbAnswer = { data?: unknown; error?: unknown }

// What a call answers. Undefined falls back to an empty answer: `null` for the single-row and
// scalar helpers, `[]` for the others, `0` for a count.
export type DbResolver = (call: DbCall) => DbAnswer | undefined

const SINGLE: ReadonlySet<DbHelper> = new Set(['selectSingle', 'selectMaybeSingle', 'selectFirst', 'selectSingleWithJoins', 'selectMaybeSingleWithJoins', 'insertRow', 'callScalar'])

function emptyAnswer(helper: DbHelper): unknown {
    if (helper === 'selectCount') return 0
    return SINGLE.has(helper) ? null : []
}

// The helpers of `@/lib/db`, recording every call instead of reaching a database. Use it with
// `vi.hoisted` so `vi.mock` can see it:
//
//   const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
//   vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
//   db.answer(call => (call.table === 'agents' ? { data: [{ id: 'a1' }] } : undefined))
//
// `queryRows` records its SQL object as the first argument and `table` as 'sql'.
export function fakeDb(initial: DbResolver = () => undefined) {
    let resolve = initial
    const calls: DbCall[] = []

    const helper =
        (name: DbHelper) =>
        async (scope: DbScope, table: unknown, ...args: unknown[]) => {
            const call: DbCall = name === 'queryRows' ? { helper: name, table: 'sql', args: [table, ...args], scope } : { helper: name, table: String(table), args, scope }
            calls.push(call)
            const answer = resolve(call)
            if (answer?.error) return { data: null, error: answer.error }
            return { data: answer && 'data' in answer ? answer.data : emptyAnswer(name), error: null }
        }

    const helpers = Object.fromEntries(HELPERS.map(name => [name, helper(name)])) as Record<DbHelper, (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>

    return {
        helpers,
        calls,
        answer(next: DbResolver) {
            resolve = next
        },
        callsTo(helperName: DbHelper, table?: string) {
            return calls.filter(call => call.helper === helperName && (table === undefined || call.table === table))
        },
        reset() {
            calls.length = 0
            resolve = initial
        },
    }
}

export type FakeDb = ReturnType<typeof fakeDb>

// A scope for code under test that only hands it to the faked helpers.
export function fakeScope(kind: DbScope['kind'] = 'service', userId: string | null = null): DbScope {
    return {
        kind,
        userId,
        run: () => {
            throw new Error('fakeScope reached the database: mock the helper this code calls.')
        },
    }
}
