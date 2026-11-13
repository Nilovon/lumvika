import { describe, expect, it } from 'vitest'

import { localDayKey, throughputDays } from './throughput'

describe('throughputDays', () => {
    const today = new Date(2026, 10, 12, 15, 30)

    it('has one bucket per day, oldest first and ending today, quiet days included', () => {
        const days = throughputDays([], [], today, 14)
        expect(days).toHaveLength(14)
        expect(days[0].day).toBe('2026-10-30')
        expect(days[13].day).toBe('2026-11-12')
        expect(days.every(day => day.created === 0 && day.completed === 0)).toBe(true)
    })

    it('counts creations and completions on the local day they happened, and drops older ones', () => {
        const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString()
        const days = throughputDays([at(12, 1), at(12, 23), at(11, 9), new Date(2026, 9, 20, 9).toISOString()], [at(12, 10), at(10, 0)], today, 14)
        const byDay = Object.fromEntries(days.map(day => [day.day, [day.created, day.completed]]))
        expect(byDay['2026-11-12']).toEqual([2, 1])
        expect(byDay['2026-11-11']).toEqual([1, 0])
        expect(byDay['2026-11-10']).toEqual([0, 1])
        expect(days.reduce((sum, day) => sum + day.created, 0)).toBe(3)
    })

    it('keys a day by the reader calendar', () => {
        expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    })
})
