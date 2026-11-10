import { describe, expect, it } from 'vitest'
import { asBooleanRecord, asNumber, asString, asStringArray, clamp, requireAgreement, requireConfirmation, requireString } from './args'

describe('requireString', () => {
    it('returns a non-empty string and names the missing field otherwise', () => {
        expect(requireString('x', 'id')).toBe('x')
        expect(() => requireString('', 'id')).toThrow('Missing required argument: id')
        expect(() => requireString(3, 'id')).toThrow('Missing required argument: id')
    })
})

describe('asString / asNumber', () => {
    it('reads an empty string as absent', () => {
        expect(asString('')).toBeUndefined()
        expect(asString(1)).toBeUndefined()
        expect(asString('a')).toBe('a')
    })

    it('refuses NaN, infinities and numeric strings', () => {
        expect(asNumber(NaN)).toBeUndefined()
        expect(asNumber(Infinity)).toBeUndefined()
        expect(asNumber('5')).toBeUndefined()
        expect(asNumber(0)).toBe(0)
    })
})

describe('asStringArray', () => {
    it('keeps only the non-empty strings and reads anything else as empty', () => {
        expect(asStringArray(['a', '', 3, null, 'b'])).toEqual(['a', 'b'])
        expect(asStringArray('a')).toEqual([])
    })
})

describe('asBooleanRecord', () => {
    it('keeps the boolean entries only', () => {
        expect(asBooleanRecord({ a: true, b: 'yes', c: false })).toEqual({ a: true, c: false })
    })

    it('reads a record with no boolean, or no object at all, as absent', () => {
        expect(asBooleanRecord({ a: 1 })).toBeUndefined()
        expect(asBooleanRecord(null)).toBeUndefined()
        expect(asBooleanRecord('x')).toBeUndefined()
    })
})

describe('clamp', () => {
    it('uses the fallback only when the value is absent', () => {
        expect(clamp(undefined, 20, 100)).toBe(20)
    })

    it('truncates and keeps the value between 1 and the max', () => {
        expect(clamp(7.9, 20, 100)).toBe(7)
        expect(clamp(0, 20, 100)).toBe(1)
        expect(clamp(-5, 20, 100)).toBe(1)
        expect(clamp(500, 20, 100)).toBe(100)
    })
})

describe('requireConfirmation / requireAgreement', () => {
    it('accepts only a literal true', () => {
        expect(() => requireConfirmation({ confirm: true }, 'the agent')).not.toThrow()
        expect(() => requireConfirmation({ confirm: 'true' }, 'the agent')).toThrow('This deletes the agent for good')
        expect(() => requireAgreement({}, 'its memories')).toThrow('This sends its memories out of the workspace')
        expect(() => requireAgreement({ confirm: true }, 'its memories')).not.toThrow()
    })
})
