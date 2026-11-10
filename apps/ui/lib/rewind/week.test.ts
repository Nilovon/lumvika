import { describe, expect, it } from 'vitest'
import { lastCompletedWeek, weekEndOf } from './week'

describe('weekEndOf', () => {
    it('matches the exclusive end the weekly sweep uses', () => {
        const week = lastCompletedWeek(new Date('2026-09-17T08:00:00.000Z'))
        expect(week.weekStart).toBe('2026-09-07')
        expect(weekEndOf(week.weekStart)).toBe(week.to)
    })
})
