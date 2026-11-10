import { describe, expect, it } from 'vitest'
import { nextRunsByAgent, sameNextRuns, type AgentSchedule } from './next-runs'

const NOW = Date.UTC(2026, 9, 9, 10, 0, 0)
const iso = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString()

const schedule = (agentId: string, name: string, patch: Partial<AgentSchedule>): AgentSchedule => ({ agentId, slug: name, name, cron: null, runAt: null, timezone: 'UTC', enabled: true, lastRunAt: null, ...patch })

describe('nextRunsByAgent', () => {
    it('keeps the soonest run of each agent', () => {
        const runs = nextRunsByAgent(
            [schedule('scout', 'Weekly digest', { runAt: iso(600) }), schedule('scout', 'Daily report', { runAt: iso(12) }), schedule('scout', 'Hourly check', { cron: '0 * * * *' }), schedule('writer', 'Newsletter', { runAt: iso(90) })],
            NOW
        )
        expect(runs).toEqual({
            scout: { at: NOW + 12 * 60_000 },
            writer: { at: NOW + 90 * 60_000 },
        })
    })

    it('reads a cron in its own timezone', () => {
        const runs = nextRunsByAgent([schedule('scout', 'Morning sync', { cron: '30 12 * * *', timezone: 'Europe/Paris' })], NOW)
        expect(runs.scout.at).toBe(Date.UTC(2026, 9, 9, 10, 30, 0))
    })

    it('announces nothing for a paused schedule, a one-shot that ran, or one that is already due', () => {
        const runs = nextRunsByAgent(
            [schedule('scout', 'Paused', { cron: '0 * * * *', enabled: false }), schedule('scout', 'Ran', { runAt: iso(30), lastRunAt: iso(-1) }), schedule('scout', 'Due', { runAt: iso(-1) })],
            NOW
        )
        expect(runs).toEqual({})
    })
})

describe('sameNextRuns', () => {
    it('tells an unchanged map from one whose soonest run moved', () => {
        const runs = nextRunsByAgent([schedule('scout', 'Daily report', { runAt: iso(12) })], NOW)
        expect(sameNextRuns(runs, nextRunsByAgent([schedule('scout', 'Daily report', { runAt: iso(12) })], NOW + 1000))).toBe(true)
        expect(sameNextRuns(runs, nextRunsByAgent([schedule('scout', 'Daily report', { runAt: iso(13) })], NOW))).toBe(false)
        expect(sameNextRuns(runs, {})).toBe(false)
    })
})
