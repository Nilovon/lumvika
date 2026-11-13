import { describe, expect, it } from 'vitest'

import { issueSummary } from '@/test/issue-summary'
import { buildReviewQueue, type ReviewQueueInput } from './review-queue'

const SCOUT = { kind: 'agent', agentId: 'scout' } as const
const ADA = { kind: 'user', userId: 'ada' } as const

function input(overrides: Partial<ReviewQueueInput> = {}): ReviewQueueInput {
    return {
        issues: [],
        facts: [],
        comments: [],
        statusChanges: [],
        projects: [
            { id: 'mine', key: 'WEB', name: 'Website', leadUserId: 'me' },
            { id: 'other', key: 'OPS', name: 'Operations', leadUserId: 'ada' },
        ],
        ...overrides,
    }
}

describe('buildReviewQueue', () => {
    it('puts my issues first, then the one waiting the longest', () => {
        const queue = buildReviewQueue(
            input({
                issues: [
                    issueSummary({ id: 'theirs-old', projectId: 'other', status: 'in_review', updatedAt: '2026-11-01T00:00:00.000Z' }),
                    issueSummary({ id: 'created-by-me', projectId: 'other', status: 'in_review', updatedAt: '2026-11-09T00:00:00.000Z' }),
                    issueSummary({ id: 'led-by-me', projectId: 'mine', status: 'in_review', updatedAt: '2026-11-05T00:00:00.000Z' }),
                    issueSummary({ id: 'todo', projectId: 'mine', status: 'todo' }),
                ],
                facts: [{ id: 'created-by-me', createdByUserId: 'me', blockedReason: null }],
            }),
            'me',
        )
        expect(queue.toReview.map(item => [item.issue.id, item.mine])).toEqual([
            ['led-by-me', true],
            ['created-by-me', true],
            ['theirs-old', false],
        ])
        expect(queue.blocked).toEqual([])
    })

    it('says who handed it back and when, with its last comment as the summary', () => {
        const queue = buildReviewQueue(
            input({
                issues: [issueSummary({ id: 'nav', projectId: 'other', status: 'in_review', updatedAt: '2026-11-10T12:00:00.000Z' })],
                statusChanges: [
                    { issueId: 'nav', actor: ADA, to: 'in_progress', createdAt: '2026-11-10T08:00:00.000Z' },
                    { issueId: 'nav', actor: SCOUT, to: 'in_review', createdAt: '2026-11-10T11:00:00.000Z' },
                    { issueId: 'nav', actor: ADA, to: 'in_review', createdAt: '2026-11-03T11:00:00.000Z' },
                ],
                comments: [
                    { issueId: 'nav', author: ADA, body: 'First look', createdAt: '2026-11-09T00:00:00.000Z' },
                    { issueId: 'nav', author: SCOUT, body: 'Done, the menu has 5 entries.', createdAt: '2026-11-10T10:59:00.000Z' },
                ],
            }),
            'me',
        )
        expect(queue.toReview[0]).toMatchObject({ handedBy: SCOUT, handedAt: '2026-11-10T11:00:00.000Z', lastComment: { body: 'Done, the menu has 5 entries.' }, project: { key: 'OPS' } })
    })

    it('shows the blocked reason and falls back on the last update when the log says nothing', () => {
        const queue = buildReviewQueue(
            input({
                issues: [issueSummary({ id: 'stuck', projectId: 'mine', status: 'blocked', updatedAt: '2026-11-08T00:00:00.000Z' }), issueSummary({ id: 'quiet', projectId: 'mine', status: 'blocked', updatedAt: '2026-11-07T00:00:00.000Z' })],
                facts: [
                    { id: 'stuck', createdByUserId: null, blockedReason: '  Needs the CMS export from Ada.  ' },
                    { id: 'quiet', createdByUserId: null, blockedReason: '   ' },
                ],
            }),
            'me',
        )
        expect(queue.blocked.map(item => [item.issue.id, item.blockedReason, item.handedBy, item.handedAt])).toEqual([
            ['quiet', null, null, '2026-11-07T00:00:00.000Z'],
            ['stuck', 'Needs the CMS export from Ada.', null, '2026-11-08T00:00:00.000Z'],
        ])
    })

    it('leaves out an issue whose project it cannot name', () => {
        const queue = buildReviewQueue(input({ issues: [issueSummary({ projectId: 'gone', status: 'in_review' })] }), null)
        expect(queue.toReview).toEqual([])
    })
})
