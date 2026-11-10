import { describe, expect, it } from 'vitest'

import { contextStatsOf } from './context-stats'

const assistant = (metadata?: unknown) => ({ role: 'assistant', metadata })

describe('contextStatsOf', () => {
    it('reads the occupancy the engine captured on the latest assistant message', () => {
        const stats = contextStatsOf([assistant({ provider: 'claude', model: 'opus', usage: { inputTokens: 9, context: { usedTokens: 40, maxTokens: 200 } } }), { role: 'user' }], null, 'fallback')
        expect(stats).toMatchObject({ used: 40, max: 200, model: 'opus', provider: 'claude' })
    })

    it('hides the gauge for a claude run with no captured occupancy', () => {
        expect(contextStatsOf([assistant({ provider: 'claude', usage: { inputTokens: 900 } })], null, undefined)).toBeNull()
    })

    it('approximates from the tokens of an API provider and falls back on the picked model', () => {
        const stats = contextStatsOf([assistant({ provider: 'openrouter', usage: { inputTokens: 30, outputTokens: 5 } })], null, 'picked')
        expect(stats).toMatchObject({ used: 35, max: undefined, model: 'picked' })
    })

    it('uses the seed of the last finished run when no message carries usage', () => {
        const stats = contextStatsOf([assistant(), { role: 'user' }], { usage: { totalTokens: 12 }, provider: null }, 'picked')
        expect(stats).toMatchObject({ used: 12, model: 'picked', provider: undefined })
    })

    it('answers null with neither usage nor seed', () => {
        expect(contextStatsOf([assistant()], null, undefined)).toBeNull()
    })
})
