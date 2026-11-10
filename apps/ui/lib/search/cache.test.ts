import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { fakeSupabase, writeMethodOf, type SupabaseResolver } from '@/test/supabase-fake'
import { readCachedSearch, searchCacheKey, storeSearch } from './cache'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))

const NOW = new Date('2026-10-12T10:00:00.000Z')
const RESULTS = [{ title: 'Lumvika', url: 'https://lumvika.com', snippet: 'Coworkers that run' }]

function database(resolve: SupabaseResolver) {
    const db = fakeSupabase(resolve)
    vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
    return db
}

describe('searchCacheKey', () => {
    it('folds case and whitespace so the same question shares one entry', () => {
        expect(searchCacheKey('  Lumvika   AI\tagents ')).toBe('lumvika ai agents')
        expect(searchCacheKey('lumvika ai agents')).toBe('lumvika ai agents')
    })
})

describe('readCachedSearch', () => {
    beforeEach(() => {
        vi.useFakeTimers({ now: NOW })
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns the results of an entry fetched within the last day', async () => {
        const db = database(() => ({ data: { results: RESULTS } }))

        await expect(readCachedSearch('lumvika')).resolves.toEqual(RESULTS)
        expect(db.chainsOn('web_search_cache')[0]).toEqual(
            expect.arrayContaining([
                { table: 'web_search_cache', method: 'eq', args: ['query_key', 'lumvika'] },
                { table: 'web_search_cache', method: 'gte', args: ['fetched_at', '2026-10-11T10:00:00.000Z'] },
            ])
        )
    })

    it('misses when nothing fresh is kept', async () => {
        database(() => ({ data: null }))

        await expect(readCachedSearch('lumvika')).resolves.toBeNull()
    })

    it('misses rather than fails when the cache cannot be read', async () => {
        database(() => ({ error: { message: 'relation does not exist' } }))
        await expect(readCachedSearch('lumvika')).resolves.toBeNull()

        vi.mocked(createServiceRoleClient).mockImplementation(() => {
            throw new Error('network')
        })
        await expect(readCachedSearch('lumvika')).resolves.toBeNull()
    })
})

describe('storeSearch', () => {
    beforeEach(() => {
        vi.useFakeTimers({ now: NOW })
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('upserts the results under their key, stamped now', async () => {
        const db = database(() => undefined)

        await storeSearch('lumvika', RESULTS)

        expect(db.writes('web_search_cache')).toEqual([{ method: 'upsert', payload: { query_key: 'lumvika', results: RESULTS, fetched_at: NOW.toISOString() }, filters: [] }])
    })

    it('never throws when the entry cannot be stored', async () => {
        database((_table, calls) => (writeMethodOf(calls) ? { error: { message: 'permission denied' } } : undefined))

        await expect(storeSearch('lumvika', RESULTS)).resolves.toBeUndefined()
        expect(console.error).toHaveBeenCalled()
    })
})
