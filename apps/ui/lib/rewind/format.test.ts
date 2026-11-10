import { describe, expect, it } from 'vitest'
import { rewindFixtures } from './fixtures'
import { dailyTotals, formatDuration, formatWeekRange, localHourly, outOfOfficeShare, percentChange } from './format'
import { rewindSlides } from './slides'

function hourlyWith(entries: Record<number, number>): number[] {
    return Array.from({ length: 168 }, (_, hour) => entries[hour] ?? 0)
}

describe('localHourly', () => {
    it('moves UTC buckets into the viewer timezone', () => {
        const local = localHourly(hourlyWith({ 0: 1, 10: 2, 167: 3 }), 120)
        expect(local[2]).toBe(1)
        expect(local[12]).toBe(2)
        expect(local.reduce((a, b) => a + b, 0)).toBe(3)
    })

    it('moves them the other way west of Greenwich', () => {
        expect(localHourly(hourlyWith({ 10: 2 }), -300)[5]).toBe(2)
    })
})

describe('week shape', () => {
    it('sums days and counts what happened outside office hours', () => {
        const hourly = hourlyWith({ 10: 2, [24 + 22]: 1, [24 * 6 + 12]: 1 })
        expect(dailyTotals(hourly).map(d => d.runs)).toEqual([2, 1, 0, 0, 0, 0, 1])
        expect(outOfOfficeShare(hourly)).toBe(50)
    })

    it('labels the week by its first and last day', () => {
        expect(formatWeekRange('2026-09-07T00:00:00.000Z', '2026-09-14T00:00:00.000Z')).toBe('Sep 7 to Sep 13')
    })

    it('formats durations and changes', () => {
        expect(formatDuration(47 * 60_000)).toBe('47 min')
        expect(formatDuration(90 * 60_000)).toBe('1h 30m')
        expect(percentChange(150, 100)).toBe(50)
        expect(percentChange(10, 0)).toBeNull()
    })
})

describe('rewindSlides', () => {
    it('tells the whole story of a busy week', () => {
        expect(rewindSlides(rewindFixtures(new Map()).rich)).toEqual(['intro', 'hours', 'rhythm', 'clock', 'mvp', 'connectors', 'highlights', 'memory', 'awards', 'outro'])
    })

    it('drops what a single agent week has nothing to say about', () => {
        const slides = rewindSlides(rewindFixtures(new Map()).solo)
        expect(slides).not.toContain('highlights')
    })
})
