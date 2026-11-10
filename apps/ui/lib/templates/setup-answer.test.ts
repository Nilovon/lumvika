import { isSetupAnswered } from '@rerun/contracts'
import { describe, expect, it } from 'vitest'

// Four places ask the same question of a template author (the capture review, the agent's Install
// tab, create_agent/update_agent, the capture itself). What they must agree on is that a "yes" with
// no instructions is not an answer: the copy would carry `required: true` and no INSTALL.md, so the
// engine never counts it as pending and the install the card promises never runs.

describe('isSetupAnswered', () => {
    it('treats an unanswered question as unanswered', () => {
        expect(isSetupAnswered({ required: null, prompt: '' })).toBe(false)
        expect(isSetupAnswered({ required: null, prompt: 'Ask for the Stripe key.' })).toBe(false)
    })

    it('rejects a yes with nothing behind it', () => {
        expect(isSetupAnswered({ required: true, prompt: '' })).toBe(false)
        expect(isSetupAnswered({ required: true, prompt: '   \n  ' })).toBe(false)
    })

    it('accepts a yes with instructions and a plain no', () => {
        expect(isSetupAnswered({ required: true, prompt: 'Ask for the Stripe key, then test it.' })).toBe(true)
        expect(isSetupAnswered({ required: false, prompt: '' })).toBe(true)
    })
})
