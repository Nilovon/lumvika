import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@/lib/auth/session/request', async () => ({ getRequestScope: async () => (await import('@/test/db-fake')).fakeScope('user', 'u1') }))

import { markRunsSeenAction } from './notification-reads.actions'

const SESSION = '33333333-3333-4333-8333-333333333333'

beforeEach(() => db.reset())

describe('markRunsSeenAction', () => {
    it('stamps the read for the caller, moving an existing one forward rather than skipping it', async () => {
        db.answer(() => ({ data: [{ session_id: SESSION, seen_at: '2026-11-11T10:00:00.000Z' }] }))
        expect(await markRunsSeenAction([SESSION])).toEqual([{ session_id: SESSION, seen_at: '2026-11-11T10:00:00.000Z' }])
        const [rows, options] = db.callsTo('upsertRows', 'session_reads')[0].args
        expect(rows).toEqual([{ session_id: SESSION, user_id: 'u1' }])
        expect(options).toMatchObject({ onConflict: ['session_id', 'user_id'], update: ['user_id'] })
    })
})
