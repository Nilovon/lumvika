import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { fakeSupabase, type FakeSupabase } from '@/test/supabase-fake'
import { purgeWebSearchCache } from './purge-web-search-cache'

vi.mock('@trigger.dev/sdk/v3', async () => (await import('@/test/trigger-sdk')).triggerSdkMock())
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))

const NOW = new Date('2026-10-12T10:00:00.000Z')

describe('purgeWebSearchCache', () => {
    let db: FakeSupabase

    beforeEach(() => {
        vi.useFakeTimers({ now: NOW })
        db = fakeSupabase(() => ({ count: 4 }))
        vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('deletes the entries fetched more than a day ago', async () => {
        await expect(purgeWebSearchCache()).resolves.toEqual({ purged: 4 })

        expect(db.writes('web_search_cache')).toEqual([{ method: 'delete', payload: { count: 'exact' }, filters: [{ table: 'web_search_cache', method: 'lt', args: ['fetched_at', '2026-10-11T10:00:00.000Z'] }] }])
    })

    it('fails the run when the delete is refused', async () => {
        db = fakeSupabase(() => ({ error: { message: 'permission denied' } }))
        vi.mocked(createServiceRoleClient).mockReturnValue(db.client)

        await expect(purgeWebSearchCache()).rejects.toThrow('permission denied')
    })
})
