import { describe, expect, it } from 'vitest'

import { issueSummary } from '@/test/issue-summary'
import { compareForWork, groupByWorkingOrder, mergeIssues, openFirst } from './my-work'

describe('groupByWorkingOrder', () => {
    it('reads in working order and leaves closed issues and empty groups out', () => {
        const groups = groupByWorkingOrder([
            issueSummary({ id: 'review', status: 'in_review' }),
            issueSummary({ id: 'todo', status: 'todo' }),
            issueSummary({ id: 'done', status: 'done' }),
            issueSummary({ id: 'doing', status: 'in_progress' }),
            issueSummary({ id: 'stuck', status: 'blocked' }),
            issueSummary({ id: 'later', status: 'backlog' }),
        ])
        expect(groups.map(group => group.status)).toEqual(['in_progress', 'todo', 'blocked', 'in_review', 'backlog'])
        expect(groups.flatMap(group => group.issues.map(issue => issue.id))).not.toContain('done')
    })

    it('puts the most urgent first, then the nearest due date, then the freshest', () => {
        const sorted = [
            issueSummary({ id: 'low', priority: 'low', dueDate: '2026-11-01' }),
            issueSummary({ id: 'urgent-late', priority: 'urgent', dueDate: '2026-12-01' }),
            issueSummary({ id: 'urgent-soon', priority: 'urgent', dueDate: '2026-11-15' }),
            issueSummary({ id: 'urgent-undated-new', priority: 'urgent', updatedAt: '2026-11-10T00:00:00.000Z' }),
            issueSummary({ id: 'urgent-undated-old', priority: 'urgent', updatedAt: '2026-11-02T00:00:00.000Z' }),
        ].sort(compareForWork)
        expect(sorted.map(issue => issue.id)).toEqual(['urgent-soon', 'urgent-late', 'urgent-undated-new', 'urgent-undated-old', 'low'])
    })
})

describe('openFirst and mergeIssues', () => {
    it('lists the open issues before the closed ones, each newest first', () => {
        const listed = openFirst([
            issueSummary({ id: 'done-new', status: 'done', updatedAt: '2026-11-11T00:00:00.000Z' }),
            issueSummary({ id: 'open-old', status: 'todo', updatedAt: '2026-11-01T00:00:00.000Z' }),
            issueSummary({ id: 'open-new', status: 'blocked', updatedAt: '2026-11-05T00:00:00.000Z' }),
            issueSummary({ id: 'cancelled', status: 'cancelled', updatedAt: '2026-11-02T00:00:00.000Z' }),
        ])
        expect(listed.map(issue => issue.id)).toEqual(['open-new', 'open-old', 'done-new', 'cancelled'])
    })

    it('keeps one copy of an issue read twice, the freshest', () => {
        const merged = mergeIssues([issueSummary({ id: 'a', title: 'old', updatedAt: '2026-11-01T00:00:00.000Z' })], [issueSummary({ id: 'a', title: 'new', updatedAt: '2026-11-03T00:00:00.000Z' }), issueSummary({ id: 'b', updatedAt: '2026-11-02T00:00:00.000Z' })])
        expect(merged.map(issue => [issue.id, issue.title])).toEqual([
            ['a', 'new'],
            ['b', 'Write the launch post'],
        ])
    })
})
