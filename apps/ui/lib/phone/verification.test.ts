import { describe, expect, it } from 'vitest'

import { phoneStatusOf, verificationLanguage } from './verification'

describe('verificationLanguage', () => {
    it('takes the language the browser asks for first', () => {
        expect(verificationLanguage('fr-BE,fr;q=0.9,en;q=0.8')).toBe('fr-BE')
        expect(verificationLanguage('nl')).toBe('nl')
    })

    it('names none when the header carries no tag Bird would accept', () => {
        expect(verificationLanguage(null)).toBeNull()
        expect(verificationLanguage('')).toBeNull()
        expect(verificationLanguage('*')).toBeNull()
        expect(verificationLanguage('not a tag')).toBeNull()
    })
})

describe('phoneStatusOf', () => {
    const row = (overrides: object = {}) => ({ verified_at: null, skipped_at: null, unverifiable_at: null, ...overrides })

    it('reads where the account stands with its phone step', () => {
        expect(phoneStatusOf(null)).toBe('none')
        expect(phoneStatusOf(row())).toBe('pending')
        expect(phoneStatusOf(row({ skipped_at: '2026-10-21T00:00:00Z' }))).toBe('skipped')
        expect(phoneStatusOf(row({ verified_at: '2026-10-21T00:00:00Z' }))).toBe('verified')
    })

    it('tells a number no code reaches from a skip, though both carry skipped_at', () => {
        expect(phoneStatusOf(row({ skipped_at: '2026-10-21T00:00:00Z', unverifiable_at: '2026-10-21T00:00:00Z' }))).toBe('unverifiable')
    })
})
