import { describe, expect, it } from 'vitest'

import { groupUnseenRuns, unseenCount, withoutSeenLocally, type UnseenRun } from './unseen-runs'

const run = (over: Partial<UnseenRun>): UnseenRun => ({
    session_id: 's1',
    agent_id: 'a1',
    title: 'Find founders in Lyon',
    source: 'dashboard',
    slug: null,
    message: 'Found 20 founders.',
    last_at: '2026-10-20T10:00:00Z',
    run_count: 1,
    ...over,
})

describe('groupUnseenRuns', () => {
    it('folds every run of one scheduled task into one line, newest first', () => {
        const groups = groupUnseenRuns([
            run({ session_id: 'h2', source: 'schedule', slug: 'hourly', title: 'schedule: hourly', last_at: '2026-10-20T12:00:00Z' }),
            run({ session_id: 'c1', last_at: '2026-10-20T11:00:00Z', run_count: 2 }),
            run({ session_id: 'h1', source: 'schedule', slug: 'hourly', title: 'schedule: hourly', last_at: '2026-10-20T09:00:00Z' }),
        ])
        expect(groups.map(g => [g.key, g.count, g.latestSessionId])).toEqual([
            ['a1:schedule:hourly', 2, 'h2'],
            ['c1', 2, 'c1'],
        ])
        expect(groups[0].sessionIds).toEqual(['h2', 'h1'])
    })

    it('keeps two conversations apart, even with the same title', () => {
        expect(groupUnseenRuns([run({ session_id: 'c1' }), run({ session_id: 'c2' })])).toHaveLength(2)
    })
})

describe('unseenCount', () => {
    it('counts runs, not conversations', () => {
        expect(unseenCount([run({ run_count: 3 }), run({ session_id: 's2' })])).toBe(4)
    })
})

describe('withoutSeenLocally', () => {
    it('hides a conversation read in this tab until a newer run lands in it', () => {
        const seenAt = new Date('2026-10-20T10:30:00Z').getTime()
        expect(withoutSeenLocally([run({})], { s1: seenAt })).toEqual([])
        expect(withoutSeenLocally([run({ last_at: '2026-10-20T11:00:00Z' })], { s1: seenAt })).toHaveLength(1)
    })

    it('hides a conversation whose read the server has not stamped yet, whatever its last run', () => {
        expect(withoutSeenLocally([run({ last_at: '2099-01-01T00:00:00Z' })], { s1: Number.POSITIVE_INFINITY })).toEqual([])
    })
})
