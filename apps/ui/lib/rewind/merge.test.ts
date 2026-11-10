import { describe, expect, it } from 'vitest'
import { agentReport, FIXTURE_WEEK, rewindFixtures } from './fixtures'
import { mergeRewind, type RewindAgentInput } from './merge'
import { lastCompletedWeek } from './week'

function agent(agentId: string, partial: Parameters<typeof agentReport>[0], spaceId = 'space-1'): RewindAgentInput {
    return { agentId, engineAgentId: `e-${agentId}`, spaceId, name: agentId, spaceName: null, report: agentReport(partial) }
}

describe('lastCompletedWeek', () => {
    it('is the Monday-to-Monday UTC week before the current one', () => {
        expect(lastCompletedWeek(new Date('2026-09-14T05:00:00.000Z'))).toEqual({
            weekStart: '2026-09-07',
            from: '2026-09-07T00:00:00.000Z',
            to: '2026-09-14T00:00:00.000Z',
        })
        expect(lastCompletedWeek(new Date('2026-09-13T23:59:00.000Z')).weekStart).toBe('2026-08-31')
    })
})

describe('mergeRewind', () => {
    it('sums the week across agents and ranks the busiest first', () => {
        const hourly = new Array(168).fill(0)
        hourly[3] = 2
        const payload = mergeRewind({
            week: FIXTURE_WEEK, catalog: new Map(),
            agents: [
                agent('quiet', { runs: { total: 1, done: 1, error: 0, cancelled: 0 }, workedMs: 1000, costMicros: 10 }),
                agent('busy', { runs: { total: 5, done: 4, error: 1, cancelled: 0 }, workedMs: 9000, hourly }),
                agent('idle', {}),
                { ...agent('off', {}), report: null },
            ],
            previous: null,
            highlights: [],
        })

        expect(payload.totals).toMatchObject({ runs: 6, done: 5, errors: 1, workedMs: 10_000, costMicros: 10, activeAgents: 2, unreachableAgents: 1 })
        expect(payload.agents.map(a => a.agentId)).toEqual(['busy', 'quiet'])
        expect(payload.mvpAgentId).toBe('busy')
        expect(payload.hourly[3]).toBe(2)
    })

    it('keeps the cost unknown when no agent knew it', () => {
        const payload = mergeRewind({ week: FIXTURE_WEEK, catalog: new Map(), agents: [agent('a', { runs: { total: 1, done: 1, error: 0, cancelled: 0 } })], previous: null, highlights: [] })
        expect(payload.totals.costMicros).toBeNull()
    })

    it('resolves who called whom within the same Box only', () => {
        const payload = mergeRewind({
            week: FIXTURE_WEEK, catalog: new Map(),
            agents: [
                agent('caller', { runs: { total: 1, done: 1, error: 0, cancelled: 0 } }),
                agent('callee', { runs: { total: 1, done: 1, error: 0, cancelled: 0 }, calledBy: [{ agentId: 'e-caller', count: 3 }] }),
                agent('stranger', { calledBy: [{ agentId: 'e-caller', count: 9 }] }, 'space-2'),
            ],
            previous: null,
            highlights: [],
        })

        expect(payload.collaborations).toEqual([{ fromAgentId: 'caller', toAgentId: 'callee', count: 3 }])
        expect(payload.awards).toContainEqual({ id: 'team-player', agentId: 'caller', value: 3 })
    })

    it('hands out an award only past its floor', () => {
        const payload = mergeRewind({
            week: FIXTURE_WEEK, catalog: new Map(),
            agents: [agent('a', { runs: { total: 2, done: 2, error: 0, cancelled: 0 }, tools: { total: 3, errors: 0, top: [] } })],
            previous: null,
            highlights: [],
        })
        expect(payload.awards).toEqual([])
    })

    it('builds a coherent rich fixture', () => {
        const rich = rewindFixtures(new Map()).rich
        expect(rich.totals.unreachableAgents).toBe(1)
        expect(rich.connectors[0]).toMatchObject({ slug: 'gmail', name: 'Gmail', agents: 3 })
        expect(rich.collaborations.length).toBe(2)
        expect(rich.awards.map(a => a.id)).toEqual(expect.arrayContaining(['night-owl', 'marathon', 'flawless', 'toolsmith', 'connector-hub']))
    })
})
