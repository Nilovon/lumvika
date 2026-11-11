import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const { readCachedSearch, searchCacheKey, storeSearch } = await import('./cache')

const NOW = new Date('2026-10-12T10:00:00.000Z')
const RESULTS = [{ title: 'Lumvika', url: 'https://lumvika.com', snippet: 'Coworkers that run' }]

beforeEach(() => db.reset())

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
        db.answer(() => ({ data: { results: RESULTS } }))

        await expect(readCachedSearch('lumvika')).resolves.toEqual(RESULTS)
        const [read] = db.callsTo('selectMaybeSingle', 'web_search_cache')
        expect(read.args[1]).toEqual({ query_key: 'lumvika', fetched_at: { gte: '2026-10-11T10:00:00.000Z' } })
        expect(read.scope.kind).toBe('service')
    })

    it('misses when nothing fresh is kept', async () => {
        db.answer(() => ({ data: null }))

        await expect(readCachedSearch('lumvika')).resolves.toBeNull()
    })

    it('misses rather than fails when the cache cannot be read', async () => {
        db.answer(() => ({ error: { message: 'relation does not exist' } }))
        await expect(readCachedSearch('lumvika')).resolves.toBeNull()

        db.answer(() => {
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
        await storeSearch('lumvika', RESULTS)

        expect(db.callsTo('upsertRows', 'web_search_cache').map(call => call.args)).toEqual([[{ query_key: 'lumvika', results: RESULTS, fetched_at: NOW.toISOString() }, { onConflict: ['query_key'] }]])
    })

    it('never throws when the entry cannot be stored', async () => {
        db.answer(call => (call.helper === 'upsertRows' ? { error: { message: 'permission denied' } } : undefined))

        await expect(storeSearch('lumvika', RESULTS)).resolves.toBeUndefined()
        expect(console.error).toHaveBeenCalled()
    })
})
