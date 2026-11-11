import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers, inTransaction: (scope: unknown, work: (scope: unknown) => unknown) => work(scope) }))
vi.mock('@/lib/auth/session/request', async () => ({ getRequestScope: async () => (await import('@/test/db-fake')).fakeScope('user', 'u1') }))
vi.mock('@/app/api/_services/chat.service', () => ({ findIdleSessions: vi.fn() }))
vi.mock('@/lib/board/live-sessions', () => ({ fetchLiveSessions: vi.fn(), sweepZombieSessions: vi.fn() }))

import { moveSpaceAction, setAgentPositionAction } from './board-store.actions'

const SPACE = '11111111-1111-4111-8111-111111111111'
const AGENT = '22222222-2222-4222-8222-222222222222'
const RECT = { col_start: 0, row_start: 20, col_end: 7, row_end: 29 }

beforeEach(() => db.reset())

describe('moveSpaceAction', () => {
    it('writes the Box and each carried agent as the caller', async () => {
        db.answer(call => ({ data: [{ id: call.table === 'spaces' ? SPACE : AGENT }] }))
        expect(await moveSpaceAction({ spaceId: SPACE, rect: RECT, carried: [{ id: AGENT, col: 1, row: 21 }] })).toEqual({ ok: true })
        expect(db.callsTo('updateRows', 'spaces')[0].args.slice(0, 2)).toEqual([RECT, { id: SPACE }])
        expect(db.callsTo('updateRows', 'agents')[0].args.slice(0, 2)).toEqual([{ col: 1, row: 21 }, { id: AGENT }])
        expect(db.callsTo('updateRows')[0].scope).toMatchObject({ kind: 'user', userId: 'u1' })
    })

    it('fails the whole move when an agent write is refused', async () => {
        db.answer(call => (call.table === 'agents' ? { error: { message: 'refused' } } : { data: [{ id: SPACE }] }))
        expect(await moveSpaceAction({ spaceId: SPACE, rect: RECT, carried: [{ id: AGENT, col: 1, row: 21 }] })).toEqual({ ok: false })
    })

    it('fails the whole move when an agent is hidden by the policies', async () => {
        db.answer(call => (call.table === 'agents' ? { data: [] } : { data: [{ id: SPACE }] }))
        expect(await moveSpaceAction({ spaceId: SPACE, rect: RECT, carried: [{ id: AGENT, col: 1, row: 21 }] })).toEqual({ ok: false })
    })

    it('writes nothing for an id that is not one', async () => {
        expect(await moveSpaceAction({ spaceId: 'not-an-id', rect: RECT, carried: [] })).toEqual({ ok: false })
        expect(db.calls).toEqual([])
    })
})

describe('setAgentPositionAction', () => {
    it('reports a row the policies hide as a refusal', async () => {
        db.answer(() => ({ data: [] }))
        expect(await setAgentPositionAction({ agentId: AGENT, col: 1, row: 1 })).toEqual({ ok: false })
    })
})
