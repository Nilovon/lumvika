import { describe, expect, it, vi } from 'vitest'
import { isOpaqueToken, opaqueToken } from './opaque-token'

describe('opaqueToken', () => {
    it('has the asked length and no easily misread character', () => {
        const token = opaqueToken(32)
        expect(token).toHaveLength(32)
        expect(token).toMatch(/^[a-km-np-z2-9]+$/)
        expect(isOpaqueToken(token, 32)).toBe(true)
    })

    it('maps every byte onto the alphabet, the top byte included', () => {
        const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
            ;(array as Uint8Array).set([0, 31, 32, 255])
            return array
        })
        expect(opaqueToken(4)).toBe('a9a9')
        spy.mockRestore()
    })

    it('is not the same twice', () => {
        expect(opaqueToken(32)).not.toBe(opaqueToken(32))
    })
})

describe('isOpaqueToken', () => {
    it('refuses the wrong length and any character outside the alphabet', () => {
        expect(isOpaqueToken('abc', 4)).toBe(false)
        expect(isOpaqueToken('abcl', 4)).toBe(false)
        expect(isOpaqueToken('abc0', 4)).toBe(false)
        expect(isOpaqueToken('ABCD', 4)).toBe(false)
        expect(isOpaqueToken('abcd', 4)).toBe(true)
    })
})
