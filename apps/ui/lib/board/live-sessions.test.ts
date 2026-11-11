import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEntry } from '@/lib/board/types'
import { fakeScope } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const { fetchLiveSessions, sweepZombieSessions } = await import('./live-sessions')

const NOW = new Date('2026-09-30T12:00:00Z').getTime()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()
const session = (id: string, status: SessionEntry['status'] = 'working'): SessionEntry => ({ id, agentId: 'a1', originAgentId: null, status })
const scope = fakeScope('user', 'u1')

function setup(rows: { id: string; updated_at: string | null }[]) {
    db.answer(call => (call.helper === 'selectMany' && call.table === 'sessions' ? { data: rows } : undefined))
}

const updates = () => db.callsTo('updateRows', 'sessions').map(call => call.args)

beforeEach(() => {
    db.reset()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
})

afterEach(() => {
    vi.useRealTimers()
})

describe('sweepZombieSessions', () => {
    it('reads nothing when no session is working', async () => {
        setup([])
        await sweepZombieSessions(scope, [session('s1', 'idle'), session('s2', 'waiting_human' as SessionEntry['status'])], vi.fn())
        expect(db.calls).toEqual([])
    })

    it('flips to idle, in the table and in place, a stale session the engine no longer runs', async () => {
        setup([{ id: 's1', updated_at: minutesAgo(6) }])
        const sessions = [session('s1')]
        await sweepZombieSessions(scope, sessions, async ids => ids)
        expect(updates()).toEqual([[{ status: 'idle' }, { id: ['s1'] }]])
        expect(sessions[0].status).toBe('idle')
    })

    it('never asks the engine about a session updated in the last five minutes or never updated', async () => {
        const idleAmong = vi.fn(async (ids: string[]) => ids)
        setup([
            { id: 'fresh', updated_at: minutesAgo(4) },
            { id: 'never', updated_at: null },
        ])
        await sweepZombieSessions(scope, [session('fresh'), session('never')], idleAmong)
        expect(idleAmong).not.toHaveBeenCalled()
        expect(updates()).toEqual([])
    })

    it('keeps a session the engine still runs, or could not answer for, as working', async () => {
        setup([
            { id: 'running', updated_at: minutesAgo(60) },
            { id: 'unreachable', updated_at: minutesAgo(60) },
            { id: 'done', updated_at: minutesAgo(60) },
        ])
        const sessions = [session('running'), session('unreachable'), session('done')]
        await sweepZombieSessions(scope, sessions, async ids => ids.filter(id => id === 'done'))
        expect(sessions.map(s => s.status)).toEqual(['working', 'working', 'idle'])
        expect(updates()[0][1]).toEqual({ id: ['done'] })
    })

    it('keeps every candidate working when the engine cannot be asked at all', async () => {
        setup([{ id: 's1', updated_at: minutesAgo(60) }])
        const sessions = [session('s1')]
        await sweepZombieSessions(scope, sessions, async () => {
            throw new Error('engine down')
        })
        expect(sessions[0].status).toBe('working')
        expect(updates()).toEqual([])
    })

    it('checks at most ten sessions per sweep', async () => {
        const rows = Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, updated_at: minutesAgo(30) }))
        const idleAmong = vi.fn(async (ids: string[]) => ids)
        setup(rows)
        await sweepZombieSessions(scope, rows.map(r => session(r.id)), idleAmong)
        expect(idleAmong).toHaveBeenCalledTimes(1)
        expect(idleAmong.mock.calls[0][0]).toHaveLength(10)
    })
})

describe('fetchLiveSessions', () => {
    it('maps the non-idle sessions newest first and reports a failed read as null', async () => {
        db.answer(() => ({ data: [{ id: 's1', agent_id: 'a1', origin_agent_id: 'a0', status: 'working' }] }))
        expect(await fetchLiveSessions(scope, ['a1'])).toEqual([{ id: 's1', agentId: 'a1', originAgentId: 'a0', status: 'working' }])
        const [read] = db.callsTo('selectMany', 'sessions')
        expect(read.args[1]).toEqual({ agent_id: ['a1'], status: { neq: 'idle' } })
        expect(read.args[2]).toEqual({ column: 'updated_at', ascending: false })
        db.answer(() => ({ error: { message: 'x' } }))
        expect(await fetchLiveSessions(scope, ['a1'])).toBeNull()
    })
})
