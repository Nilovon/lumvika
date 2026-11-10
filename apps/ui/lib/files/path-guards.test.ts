import { describe, expect, it } from 'vitest'
import { invalidDir, invalidName } from './path-guards'

describe('invalidName', () => {
    it('accepts a plain file name', () => {
        expect(invalidName('report.pdf')).toBe(false)
        expect(invalidName('.env')).toBe(false)
    })

    it('refuses an empty name, a separator and the parent directory', () => {
        expect(invalidName('')).toBe(true)
        expect(invalidName('a/b')).toBe(true)
        expect(invalidName('a\\b')).toBe(true)
        expect(invalidName('..')).toBe(true)
    })

    it('measures the 255 limit in utf-8 bytes, not characters', () => {
        expect(invalidName('a'.repeat(255))).toBe(false)
        expect(invalidName('a'.repeat(256))).toBe(true)
        expect(invalidName('é'.repeat(128))).toBe(true)
    })
})

describe('invalidDir', () => {
    it('accepts the root and nested relative directories', () => {
        expect(invalidDir('')).toBe(false)
        expect(invalidDir('docs')).toBe(false)
        expect(invalidDir('docs/2026/..hidden')).toBe(false)
    })

    it('refuses an absolute directory', () => {
        expect(invalidDir('/etc')).toBe(true)
    })

    it('refuses a parent segment anywhere in the path', () => {
        expect(invalidDir('..')).toBe(true)
        expect(invalidDir('../etc')).toBe(true)
        expect(invalidDir('a/../b')).toBe(true)
    })

    it('refuses a parent segment written with backslashes', () => {
        expect(invalidDir('..\\etc')).toBe(true)
        expect(invalidDir('a\\..\\b')).toBe(true)
        expect(invalidDir('a/..\\b')).toBe(true)
    })
})
