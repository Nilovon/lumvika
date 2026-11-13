import type { Goal } from '@lumvika/contracts'
import { describe, expect, it } from 'vitest'

import { buildGoalTree, filterGoalTree, flattenGoalTree, nestsUnderItself, progressOf, progressPercent, type GoalProjectRef } from './goal-tree'

function goal(id: string, overrides: Partial<Goal> = {}): Goal {
    return { id, parentGoalId: null, teamId: null, title: id, description: null, status: 'active', ownerUserId: null, targetDate: null, createdAt: 'then', updatedAt: 'then', ...overrides }
}

function project(id: string, open: number, done: number): GoalProjectRef {
    return { id, key: id.toUpperCase(), name: id, status: 'active', progress: { open, done } }
}

describe('progressOf and progressPercent', () => {
    it('counts done apart, leaves cancelled out and the rest open', () => {
        expect(progressOf({ backlog: 1, todo: 2, in_progress: 1, in_review: 1, blocked: 1, done: 4, cancelled: 3 })).toEqual({ open: 6, done: 4 })
    })

    it('has no percentage before there is anything to measure', () => {
        expect(progressPercent({ open: 0, done: 0 })).toBeNull()
        expect(progressPercent({ open: 1, done: 3 })).toBe(75)
    })
})

describe('buildGoalTree', () => {
    const goals = [goal('company'), goal('growth', { parentGoalId: 'company', teamId: 'team-a' }), goal('seo', { parentGoalId: 'growth', status: 'planned' }), goal('ops', { status: 'achieved' })]
    const tree = buildGoalTree(goals, {
        projectsByGoal: new Map([
            ['growth', [project('web', 2, 2)]],
            ['seo', [project('blog', 1, 3)]],
        ]),
        directProgressByGoal: new Map([['company', { open: 1, done: 0 }]]),
    })

    it('nests goals under their parent', () => {
        expect(tree.map(node => node.id)).toEqual(['company', 'ops'])
        expect(tree[0].children[0].children[0].id).toBe('seo')
    })

    it('rolls the progress of every goal below up into its parent', () => {
        const [company] = tree
        expect(company.progress).toEqual({ open: 1, done: 0 })
        expect(company.children[0].progress).toEqual({ open: 2, done: 2 })
        expect(company.children[0].rollup).toEqual({ open: 3, done: 5 })
        expect(company.rollup).toEqual({ open: 4, done: 5 })
    })

    it('draws a goal whose parent loops back as a root', () => {
        const looped = buildGoalTree([goal('a', { parentGoalId: 'b' }), goal('b', { parentGoalId: 'a' })], { projectsByGoal: new Map(), directProgressByGoal: new Map() })
        expect(flattenGoalTree(looped).map(node => node.id).sort()).toEqual(['a', 'b'])
    })

    it('keeps the branch above a goal that matches the filter', () => {
        expect(filterGoalTree(tree, { statuses: ['planned'], teamIds: [] }).map(node => [node.id, node.children.map(child => child.id)])).toEqual([['company', ['growth']]])
        expect(flattenGoalTree(filterGoalTree(tree, { statuses: [], teamIds: ['team-a'] })).map(node => node.id)).toEqual(['company', 'growth'])
        expect(filterGoalTree(tree, { statuses: ['cancelled'], teamIds: [] })).toEqual([])
    })
})

describe('nestsUnderItself', () => {
    const lines = [goal('a'), goal('b', { parentGoalId: 'a' }), goal('c', { parentGoalId: 'b' })]

    it('refuses the goal itself or one of its sub-goals as its parent', () => {
        expect(nestsUnderItself(lines, 'a', 'a')).toBe(true)
        expect(nestsUnderItself(lines, 'a', 'c')).toBe(true)
        expect(nestsUnderItself(lines, 'c', 'a')).toBe(false)
        expect(nestsUnderItself(lines, 'b', null)).toBe(false)
    })
})
