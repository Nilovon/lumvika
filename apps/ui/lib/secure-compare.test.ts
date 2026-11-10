import { describe, expect, it } from 'vitest'

import { bearerTokenMatches, secretMatches } from './secure-compare'

describe('bearerTokenMatches', () => {
    it('accepts the exact bearer token', () => {
        expect(bearerTokenMatches('Bearer s3cret', 's3cret')).toBe(true)
    })

    it('refuses a different token of the same length', () => {
        expect(bearerTokenMatches('Bearer s3creT', 's3cret')).toBe(false)
    })

    it('refuses a token of a different length', () => {
        expect(bearerTokenMatches('Bearer s3cret!', 's3cret')).toBe(false)
        expect(bearerTokenMatches('Bearer s3cre', 's3cret')).toBe(false)
    })

    it('refuses a header without the Bearer scheme', () => {
        expect(bearerTokenMatches('s3cret', 's3cret')).toBe(false)
        expect(bearerTokenMatches('bearer s3cret', 's3cret')).toBe(false)
    })

    it('refuses a missing or empty header', () => {
        expect(bearerTokenMatches(null, 's3cret')).toBe(false)
        expect(bearerTokenMatches('', 's3cret')).toBe(false)
        expect(bearerTokenMatches('Bearer ', 's3cret')).toBe(false)
    })

    it('refuses everything when the expected token is empty', () => {
        expect(bearerTokenMatches('Bearer ', '')).toBe(false)
        expect(bearerTokenMatches(null, '')).toBe(false)
    })
})

describe('secretMatches', () => {
    it('accepts the exact secret and refuses anything else', () => {
        expect(secretMatches('s3cret', 's3cret')).toBe(true)
        expect(secretMatches('s3creT', 's3cret')).toBe(false)
        expect(secretMatches('s3cret!', 's3cret')).toBe(false)
        expect(secretMatches(null, 's3cret')).toBe(false)
    })

    it('refuses everything when the expected secret is empty', () => {
        expect(secretMatches('', '')).toBe(false)
        expect(secretMatches(null, '')).toBe(false)
    })
})
