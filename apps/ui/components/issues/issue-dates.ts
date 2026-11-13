import { isIssueClosed, type IssueStatus } from '@lumvika/contracts'

// A due date is a calendar day (YYYY-MM-DD): read at local midnight, never shifted by the time zone.
export function dayOf(isoDate: string): Date {
    const [year, month, day] = isoDate.split('-').map(Number)
    return new Date(year, month - 1, day)
}

export function isOverdue(dueDate: string | null, status: IssueStatus, today: Date = new Date()): boolean {
    if (!dueDate || isIssueClosed(status)) return false
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return dayOf(dueDate) < startOfToday
}
