import type { IssueStatus, IssueSummary } from '@lumvika/contracts'
import { describe, expect, it } from 'vitest'

import { canDropOn, dropPosition, groupByStatus, moveLocally, positionBetween, POSITION_STEP, upsertIssue } from './board-logic'

function issue(id: string, status: IssueStatus, position: number, number = 1): IssueSummary {
    return {
        id,
        projectId: 'p1',
        number,
        ref: `ENG-${number}`,
        title: id,
        status,
        priority: 'none',
        assignee: null,
        parentIssueId: null,
        goalId: null,
        dueDate: null,
        position,
        checkoutRunId: null,
        checkedOutAt: null,
        startedAt: null,
        completedAt: null,
        createdAt: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z',
    }
}

describe('canDropOn', () => {
    it('always lets a card move inside its own column', () => {
        for (const status of ['backlog', 'done', 'cancelled'] as const) expect(canDropOn(status, status)).toBe(true)
    })

    it('follows the workflow between columns', () => {
        expect(canDropOn('backlog', 'todo')).toBe(true)
        expect(canDropOn('todo', 'in_progress')).toBe(true)
        expect(canDropOn('in_progress', 'done')).toBe(true)
        expect(canDropOn('done', 'todo')).toBe(true)
        expect(canDropOn('cancelled', 'backlog')).toBe(true)
    })

    it('refuses a jump the workflow does not have', () => {
        expect(canDropOn('backlog', 'done')).toBe(false)
        expect(canDropOn('backlog', 'in_progress')).toBe(false)
        expect(canDropOn('done', 'in_progress')).toBe(false)
        expect(canDropOn('cancelled', 'todo')).toBe(false)
        expect(canDropOn('in_review', 'blocked')).toBe(false)
    })
})

describe('positionBetween', () => {
    it('starts an empty column one step in', () => {
        expect(positionBetween(undefined, undefined)).toBe(POSITION_STEP)
    })

    it('goes one step past the last card', () => {
        expect(positionBetween(3072, undefined)).toBe(3072 + POSITION_STEP)
    })

    it('goes one step above the first card, below zero if it must', () => {
        expect(positionBetween(undefined, 1024)).toBe(0)
        expect(positionBetween(undefined, 0)).toBe(-POSITION_STEP)
    })

    it('splits the gap between two cards', () => {
        expect(positionBetween(1024, 2048)).toBe(1536)
        const tight = positionBetween(1024, 1024.5)
        expect(tight).toBeGreaterThan(1024)
        expect(tight).toBeLessThan(1024.5)
    })
})

describe('dropPosition', () => {
    const column = [issue('a', 'todo', 1024), issue('b', 'todo', 2048), issue('c', 'todo', 3072)]

    it('lands at the end when dropped on the column itself', () => {
        expect(dropPosition(column, 'x', null)).toBe(3072 + POSITION_STEP)
    })

    it('lands between the card above and the one it was dropped on', () => {
        expect(dropPosition(column, 'x', 'b')).toBe(1536)
    })

    it('lands above the first card', () => {
        expect(dropPosition(column, 'x', 'a')).toBe(0)
    })

    it('ignores the dragged card itself when reordering inside a column', () => {
        expect(dropPosition(column, 'c', 'b')).toBe(1536)
        expect(dropPosition(column, 'a', null)).toBe(3072 + POSITION_STEP)
        expect(dropPosition(column, 'a', 'c')).toBe((2048 + 3072) / 2)
    })

    it('starts an empty column', () => {
        expect(dropPosition([], 'x', null)).toBe(POSITION_STEP)
    })

    it('falls back to the end when the target card is gone', () => {
        expect(dropPosition(column, 'x', 'gone')).toBe(3072 + POSITION_STEP)
    })
})

describe('groupByStatus', () => {
    it('puts every issue in its column, in position order', () => {
        const columns = groupByStatus([issue('late', 'todo', 4096, 2), issue('first', 'todo', 1024, 3), issue('done', 'done', 1, 4)])

        expect(columns.todo.map(i => i.id)).toEqual(['first', 'late'])
        expect(columns.done.map(i => i.id)).toEqual(['done'])
        expect(columns.cancelled).toEqual([])
    })

    it('breaks a tie on the number', () => {
        const columns = groupByStatus([issue('b', 'todo', 1024, 9), issue('a', 'todo', 1024, 2)])
        expect(columns.todo.map(i => i.id)).toEqual(['a', 'b'])
    })
})

describe('moveLocally and upsertIssue', () => {
    it('moves one issue and leaves the others', () => {
        const moved = moveLocally([issue('a', 'todo', 1), issue('b', 'todo', 2)], 'a', 'in_progress', 512)
        expect(moved.map(i => [i.id, i.status, i.position])).toEqual([
            ['a', 'in_progress', 512],
            ['b', 'todo', 2],
        ])
    })

    it('replaces a known issue and appends a new one', () => {
        const issues = [issue('a', 'todo', 1)]
        expect(upsertIssue(issues, { ...issues[0], title: 'renamed' })[0].title).toBe('renamed')
        expect(upsertIssue(issues, issue('b', 'todo', 2)).map(i => i.id)).toEqual(['a', 'b'])
    })
})
