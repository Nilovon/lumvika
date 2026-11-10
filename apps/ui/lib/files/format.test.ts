import { describe, expect, it } from 'vitest'
import { formatBytes, formatEta } from './format'

describe('formatBytes', () => {
    it('scales to the unit that keeps the number readable', () => {
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(2048)).toBe('2.0 KB')
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
        expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
    })
})

describe('formatEta', () => {
    it('rounds up so it never shows zero while still working', () => {
        expect(formatEta(200)).toBe('1s left')
        expect(formatEta(45_000)).toBe('45s left')
        expect(formatEta(90_000)).toBe('1m left')
        expect(formatEta(3 * 3600 * 1000)).toBe('3h left')
    })
})
