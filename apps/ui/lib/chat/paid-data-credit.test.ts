import { describe, expect, it } from 'vitest'

import { turnRanOutOfPaidCredit } from './paid-data-credit'

const refused = { type: 'tool-paid_data', output: { status: 'not_run', reason: 'out_of_credit', billedMicros: 0, message: 'Not run' } }
const found = { type: 'tool-paid_data', output: { status: 'found', billedMicros: 36_000, message: 'Found.' } }
const text = { type: 'text' }

describe('turnRanOutOfPaidCredit', () => {
    it('is set by a paid data call refused for want of credit in the current turn', () => {
        expect(
            turnRanOutOfPaidCredit([
                { role: 'user', parts: [text] },
                { role: 'assistant', parts: [found, refused, text] },
            ])
        ).toBe(true)
    })

    it('reads a bridged call and a stored output envelope', () => {
        const bridged = { type: 'dynamic-tool', toolName: 'mcp__lumvika__paid_data', output: { type: 'json', value: refused.output } }
        expect(turnRanOutOfPaidCredit([{ role: 'assistant', parts: [bridged] }])).toBe(true)
    })

    it('ends with the turn: a new user message clears it', () => {
        expect(
            turnRanOutOfPaidCredit([
                { role: 'assistant', parts: [refused] },
                { role: 'user', parts: [text] },
            ])
        ).toBe(false)
        expect(
            turnRanOutOfPaidCredit([
                { role: 'assistant', parts: [refused] },
                { role: 'user', parts: [text] },
                { role: 'assistant', parts: [found] },
            ])
        ).toBe(false)
    })

    it('ignores a call that ran, or one refused for another reason', () => {
        const unavailable = { type: 'tool-paid_data', output: { status: 'not_run', billedMicros: 0, message: 'temporarily unavailable' } }
        expect(turnRanOutOfPaidCredit([{ role: 'assistant', parts: [found, unavailable] }])).toBe(false)
    })
})
