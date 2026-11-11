import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@trigger.dev/sdk/v3', async () => (await import('@/test/trigger-sdk')).triggerSdkMock())

const { purgeWebSearchCache } = await import('./purge-web-search-cache')

const NOW = new Date('2026-10-12T10:00:00.000Z')

describe('purgeWebSearchCache', () => {
    beforeEach(() => {
        vi.useFakeTimers({ now: NOW })
        db.reset()
        db.answer(() => ({ data: [{ query_key: 'a' }, { query_key: 'b' }, { query_key: 'c' }, { query_key: 'd' }] }))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('deletes the entries fetched more than a day ago', async () => {
        await expect(purgeWebSearchCache()).resolves.toEqual({ purged: 4 })

        const [purge] = db.callsTo('deleteRows', 'web_search_cache')
        expect(purge.args[0]).toEqual({ fetched_at: { lt: '2026-10-11T10:00:00.000Z' } })
        expect(purge.scope.kind).toBe('service')
    })

    it('fails the run when the delete is refused', async () => {
        db.answer(() => ({ error: { message: 'permission denied' } }))

        await expect(purgeWebSearchCache()).rejects.toThrow('permission denied')
    })
})
