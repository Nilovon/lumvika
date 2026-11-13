import { describe, expect, it } from 'vitest'

import { dayOf, isOverdue } from './issue-dates'

describe('dayOf', () => {
    it('reads a calendar day at local midnight', () => {
        const day = dayOf('2026-11-12')
        expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()]).toEqual([2026, 10, 12, 0])
    })
})

describe('isOverdue', () => {
    const today = new Date(2026, 10, 12, 15, 30)

    it('is overdue from the day after the due date', () => {
        expect(isOverdue('2026-11-11', 'todo', today)).toBe(true)
        expect(isOverdue('2026-11-12', 'todo', today)).toBe(false)
    })

    it('never holds a closed issue or one without a date overdue', () => {
        expect(isOverdue('2026-01-01', 'done', today)).toBe(false)
        expect(isOverdue('2026-01-01', 'cancelled', today)).toBe(false)
        expect(isOverdue(null, 'todo', today)).toBe(false)
    })
})
