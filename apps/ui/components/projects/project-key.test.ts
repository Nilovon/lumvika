import { describe, expect, it } from 'vitest'

import { isValidProjectKey, normalizeProjectKey, suggestProjectKey } from './project-key'

describe('suggestProjectKey', () => {
    it('takes the first letters of a single word', () => {
        expect(suggestProjectKey('Engineering')).toBe('ENG')
        expect(suggestProjectKey('ops')).toBe('OPS')
    })

    it('takes the initials of several words, four at most', () => {
        expect(suggestProjectKey('Customer support')).toBe('CS')
        expect(suggestProjectKey('Q4 launch plan for the website')).toBe('QLPF')
    })

    it('drops accents and symbols', () => {
        expect(suggestProjectKey('Équipe données')).toBe('ED')
        expect(suggestProjectKey('R&D')).toBe('RD')
    })

    it('starts with a letter', () => {
        expect(suggestProjectKey('2027 roadmap')).toBe('ROA')
        expect(suggestProjectKey('123')).toBe('')
        expect(suggestProjectKey('')).toBe('')
    })

    it('holds at least two characters', () => {
        expect(suggestProjectKey('X')).toBe('XX')
        expect(suggestProjectKey('A 1')).toBe('A1')
    })

    it('numbers a key already taken', () => {
        expect(suggestProjectKey('Engineering', ['ENG'])).toBe('ENG2')
        expect(suggestProjectKey('Engineering', ['eng', 'ENG2'])).toBe('ENG3')
    })

    it('always suggests a key the pattern accepts', () => {
        for (const name of ['Engineering', 'Customer support', 'Équipe données', '2027 roadmap', 'X', 'A very long project name with many words']) {
            expect(isValidProjectKey(suggestProjectKey(name))).toBe(true)
        }
    })
})

describe('normalizeProjectKey', () => {
    it('keeps capitals and digits, six at most', () => {
        expect(normalizeProjectKey('eng-12 ops')).toBe('ENG12O')
    })
})

describe('isValidProjectKey', () => {
    it('follows the pattern of the database', () => {
        expect(isValidProjectKey('ENG')).toBe(true)
        expect(isValidProjectKey('E')).toBe(false)
        expect(isValidProjectKey('1EN')).toBe(false)
        expect(isValidProjectKey('ENGINEE')).toBe(false)
    })
})
