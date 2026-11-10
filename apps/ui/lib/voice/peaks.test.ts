import { describe, expect, it } from 'vitest'
import { PEAK_COUNT, decodePeaks, encodePeaks } from './peaks'

describe('encodePeaks', () => {
    it('always emits PEAK_COUNT digits', () => {
        expect(encodePeaks([0.5]).length).toBe(PEAK_COUNT)
        expect(encodePeaks(Array.from({ length: 1000 }, () => 0.5)).length).toBe(PEAK_COUNT)
    })

    it('returns an empty string when nothing was captured', () => {
        expect(encodePeaks([])).toBe('')
    })

    it('maps the extremes to the base36 bounds', () => {
        expect(encodePeaks(Array.from({ length: 96 }, () => 0))).toBe('0'.repeat(PEAK_COUNT))
        expect(encodePeaks(Array.from({ length: 96 }, () => 1))).toBe('z'.repeat(PEAK_COUNT))
    })

    it('clamps out-of-range levels', () => {
        expect(encodePeaks([-3, 12])).toBe('0'.repeat(24) + 'z'.repeat(24))
    })

    it('averages each bucket', () => {
        const levels = [...Array.from({ length: 48 }, () => 1), ...Array.from({ length: 48 }, () => 0)]
        const encoded = encodePeaks(levels)
        expect(encoded.slice(0, 24)).toBe('z'.repeat(24))
        expect(encoded.slice(24)).toBe('0'.repeat(24))
    })
})

describe('decodePeaks', () => {
    it('round-trips a flat signal', () => {
        expect(decodePeaks(encodePeaks(Array.from({ length: 200 }, () => 1)))).toEqual(Array.from({ length: PEAK_COUNT }, () => 1))
    })

    it('reads unknown characters as silence', () => {
        expect(decodePeaks('z!0')).toEqual([1, 0, 0])
    })

    it('returns an empty array for an empty string', () => {
        expect(decodePeaks('')).toEqual([])
    })
})
