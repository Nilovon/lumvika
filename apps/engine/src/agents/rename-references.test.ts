import { describe, expect, it } from 'vitest'
import { replaceDisplayName, replaceMention } from './rename-references.js'

describe('replaceMention', () => {
    it('moves every mention of the old handle, whatever its case', () => {
        expect(replaceMention('Ask @scout, then @Scout again.', 'scout', 'ranger')).toBe('Ask @ranger, then @ranger again.')
    })

    it('leaves a longer handle and an email address alone', () => {
        expect(replaceMention('@scout_2 and team@scout.io', 'scout', 'ranger')).toBe('@scout_2 and team@scout.io')
    })

    it('leaves the bare word alone', () => {
        expect(replaceMention('the scout goes first', 'scout', 'ranger')).toBe('the scout goes first')
    })
})

describe('replaceDisplayName', () => {
    it('replaces the name the soul was written with', () => {
        expect(replaceDisplayName('# Scout\n\nYou are Scout, an autonomous coworker.', 'Scout', 'Ranger')).toBe('# Ranger\n\nYou are Ranger, an autonomous coworker.')
    })

    it('only replaces the exact name as a whole word', () => {
        expect(replaceDisplayName('Scouting with the scout, Scouts and @Scout', 'Scout', 'Ranger')).toBe('Scouting with the scout, Scouts and @Scout')
    })

    it('handles names with accents and spaces', () => {
        expect(replaceDisplayName('You are Léa Martin.', 'Léa Martin', 'Léa Dupont')).toBe('You are Léa Dupont.')
    })
})
