import { describe, expect, it } from 'vitest'
import { formatVoiceDuration } from './duration'

describe('formatVoiceDuration', () => {
    it('pads the seconds', () => {
        expect(formatVoiceDuration(7_400)).toBe('0:07')
        expect(formatVoiceDuration(84_000)).toBe('1:24')
        expect(formatVoiceDuration(723_000)).toBe('12:03')
    })

    it('shows 0:00 for nothing, a negative, or NaN', () => {
        expect(formatVoiceDuration(0)).toBe('0:00')
        expect(formatVoiceDuration(-1)).toBe('0:00')
        expect(formatVoiceDuration(Number.NaN)).toBe('0:00')
    })
})
