import { describe, expect, it } from 'vitest'
import { defaultSoul } from './soul.js'

describe('defaultSoul', () => {
    it('names the agent and states its mission', () => {
        const soul = defaultSoul({ name: 'scout', displayName: 'Scout', description: '  Find ten leads a day.  ' })
        expect(soul.startsWith('# Scout\n\nYou are Scout,')).toBe(true)
        expect(soul).toContain('Your mission: Find ten leads a day.')
        expect(soul).not.toContain('do not yet have a fixed mission')
    })

    it('says there is no mission yet when the description is blank', () => {
        const soul = defaultSoul({ name: 'scout', description: '   ' })
        expect(soul).toContain('You do not yet have a fixed mission.')
        expect(soul).not.toContain('Your mission:')
    })

    it('falls back to the name when the display name is missing or blank', () => {
        expect(defaultSoul({ name: 'scout', description: '' }).startsWith('# scout\n')).toBe(true)
        expect(defaultSoul({ name: 'scout', displayName: '  ', description: '' }).startsWith('# scout\n')).toBe(true)
        expect(defaultSoul({ name: 'scout', displayName: ' Scout ', description: '' }).startsWith('# Scout\n')).toBe(true)
    })

    it('ends with a newline', () => {
        expect(defaultSoul({ name: 'a', description: '' }).endsWith('\n')).toBe(true)
    })
})
