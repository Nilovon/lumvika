import type { IssueSummary } from '@lumvika/contracts'
import { describe, expect, it } from 'vitest'

import { filterIssues, hasFilters, NO_FILTERS } from './issue-filters'

function issue(number: number, overrides: Partial<IssueSummary> = {}): IssueSummary {
    return {
        id: `i${number}`,
        projectId: 'p1',
        number,
        ref: `ENG-${number}`,
        title: `Issue ${number}`,
        status: 'todo',
        priority: 'none',
        assignee: null,
        parentIssueId: null,
        goalId: null,
        dueDate: null,
        position: number * 1024,
        checkoutRunId: null,
        checkedOutAt: null,
        startedAt: null,
        completedAt: null,
        createdAt: `2026-11-0${number}T10:00:00Z`,
        updatedAt: `2026-11-0${number}T10:00:00Z`,
        ...overrides,
    }
}

const ISSUES = [
    issue(1, { title: 'Write the launch post', status: 'in_progress', priority: 'high', assignee: { kind: 'agent', agentId: 'scout' }, dueDate: '2026-11-20' }),
    issue(2, { title: 'Fix the login bug', status: 'todo', priority: 'urgent', assignee: { kind: 'user', userId: 'me' } }),
    issue(3, { title: 'Pricing page copy', status: 'done', priority: 'low', dueDate: '2026-11-15' }),
    issue(4, { title: 'Backlog idea', status: 'backlog' }),
]

const ids = (issues: IssueSummary[]) => issues.map(i => i.number)

describe('filterIssues', () => {
    it('keeps everything in board order without filters', () => {
        expect(ids(filterIssues(ISSUES, NO_FILTERS, 'board'))).toEqual([4, 2, 1, 3])
    })

    it('filters by status, priority and assignee together', () => {
        expect(ids(filterIssues(ISSUES, { ...NO_FILTERS, statuses: ['todo', 'in_progress'] }, 'board'))).toEqual([2, 1])
        expect(ids(filterIssues(ISSUES, { ...NO_FILTERS, priorities: ['urgent', 'high'], assignees: ['agent:scout'] }, 'board'))).toEqual([1])
        expect(ids(filterIssues(ISSUES, { ...NO_FILTERS, assignees: ['unassigned'] }, 'board'))).toEqual([4, 3])
    })

    it('searches the title and the reference', () => {
        expect(ids(filterIssues(ISSUES, { ...NO_FILTERS, text: 'LOGIN' }, 'board'))).toEqual([2])
        expect(ids(filterIssues(ISSUES, { ...NO_FILTERS, text: 'eng-3' }, 'board'))).toEqual([3])
    })

    it('sorts by priority, then by recency', () => {
        expect(ids(filterIssues(ISSUES, NO_FILTERS, 'priority'))).toEqual([2, 1, 3, 4])
    })

    it('sorts by due date, undated last', () => {
        expect(ids(filterIssues(ISSUES, NO_FILTERS, 'due'))).toEqual([3, 1, 2, 4])
    })

    it('sorts by the latest update and the latest creation', () => {
        expect(ids(filterIssues(ISSUES, NO_FILTERS, 'updated'))).toEqual([4, 3, 2, 1])
        expect(ids(filterIssues(ISSUES, NO_FILTERS, 'created'))).toEqual([4, 3, 2, 1])
    })
})

describe('hasFilters', () => {
    it('ignores a search of blanks', () => {
        expect(hasFilters({ ...NO_FILTERS, text: '  ' })).toBe(false)
        expect(hasFilters({ ...NO_FILTERS, priorities: ['low'] })).toBe(true)
    })
})
