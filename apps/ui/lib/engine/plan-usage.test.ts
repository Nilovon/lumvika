import { describe, expect, it } from 'vitest'
import { cacheHitRate, elapsedShare, paceOf, remainingPercent, tokenUsageOf, uncachedInputTokens } from './plan-usage'

const now = Date.parse('2026-11-13T12:00:00Z')
const HOUR = 60 * 60_000

// A five-hour session that resets `hoursLeft` from now, `usedPercent` spent.
function session(usedPercent: number, hoursLeft: number) {
    return { usedPercent, resetsAt: new Date(now + hoursLeft * HOUR).toISOString(), windowDurationMins: 300 }
}

describe('remainingPercent', () => {
    it('rounds what is left and clamps a reading past the bounds', () => {
        expect(remainingPercent({ usedPercent: 31.4 })).toBe(69)
        expect(remainingPercent({ usedPercent: 104 })).toBe(0)
        expect(remainingPercent({ usedPercent: -2 })).toBe(100)
    })
})

describe('elapsedShare', () => {
    it('measures the window gone by from its reset and its length', () => {
        expect(elapsedShare(session(0, 4), now)).toBeCloseTo(0.2)
        expect(elapsedShare(session(0, 0), now)).toBe(1)
        expect(elapsedShare(session(0, 9), now)).toBe(0)
    })

    it('draws no pace without a reset or a length', () => {
        expect(elapsedShare({ resetsAt: null, windowDurationMins: 300 }, now)).toBeNull()
        expect(elapsedShare({ resetsAt: '2026-11-13T15:00:00Z', windowDurationMins: null }, now)).toBeNull()
        expect(elapsedShare({ resetsAt: '2026-11-13T15:00:00Z' }, now)).toBeNull()
    })
})

describe('paceOf', () => {
    it('is ahead when more is spent than time has passed, past a tolerance of five points', () => {
        expect(paceOf(session(60, 3), now)).toBe('ahead')
        expect(paceOf(session(44, 3), now)).toBe('on')
        expect(paceOf(session(36, 3), now)).toBe('on')
        expect(paceOf(session(10, 3), now)).toBe('under')
    })

    it('has nothing to say about a window of unknown length', () => {
        expect(paceOf({ usedPercent: 90, resetsAt: null, windowDurationMins: null }, now)).toBeNull()
    })
})

describe('cache figures', () => {
    const totals = { runCount: 2, inputTokens: 10_000, outputTokens: 500, cacheReadTokens: 7_000, cacheWriteTokens: 2_000, reasoningTokens: 0, costMicros: 0 }

    it('reads the share of the input the cache served', () => {
        expect(cacheHitRate(totals)).toBeCloseTo(0.7)
        expect(cacheHitRate({ ...totals, inputTokens: 0, cacheReadTokens: 0 })).toBeNull()
    })

    it('leaves what the cache neither served nor stored, never below zero', () => {
        expect(uncachedInputTokens(totals)).toBe(1_000)
        expect(uncachedInputTokens({ ...totals, cacheWriteTokens: 5_000 })).toBe(0)
    })

    it('picks the provider of the connection out of the breakdown', () => {
        const usage = { range: '7d' as const, since: '2026-11-06T12:00:00Z', providers: [{ provider: 'codex', totals, agents: [] }] }
        expect(tokenUsageOf(usage, 'codex')?.totals.runCount).toBe(2)
        expect(tokenUsageOf(usage, 'claude')).toBeNull()
        expect(tokenUsageOf(null, 'claude')).toBeNull()
    })
})
