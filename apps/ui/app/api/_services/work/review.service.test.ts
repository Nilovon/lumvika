import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'
import { issueRow, projectRow, WORKSPACE } from '@/test/work-rows'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/app/api/_services/work/issue-effects.service', () => ({ reactToIssueChange: vi.fn() }))

const { reactToIssueChange } = await import('@/app/api/_services/work/issue-effects.service')
const { approveIssue, listReviewQueue, requestChanges, unblockIssue } = await import('./review.service')

const ME = { kind: 'user', userId: 'me' } as const

function setup(issues: Row[], extra: Partial<Tables> = {}) {
    const rows: Tables = {
        projects: [projectRow({ lead_user_id: 'me' }), projectRow({ id: 'other', key: 'OPS', name: 'Operations' }), projectRow({ id: 'hidden', key: 'SEC' })],
        workspace_members: [{ user_id: 'me', workspace_id: WORKSPACE }],
        issues,
        issue_comments: [],
        activity_events: [],
        ...extra,
    }
    const db = workDatabase(rows)
    return { rows, scope: { workspaceId: WORKSPACE, supabase: db.client } }
}

beforeEach(() => vi.mocked(reactToIssueChange).mockClear())

describe('listReviewQueue', () => {
    it('gathers the issues in review and the blocked ones of the projects I see, with who handed them back', async () => {
        const { scope } = setup(
            [
                issueRow({ id: 'review', status: 'in_review', assignee_agent_id: 'scout' }),
                issueRow({ id: 'other-review', project_id: 'other', number: 2, status: 'in_review', updated_at: '2026-10-20T00:00:00.000Z' }),
                issueRow({ id: 'blocked', project_id: 'other', number: 3, status: 'blocked', blocked_reason: 'Waiting for the CMS export.' }),
                issueRow({ id: 'hidden', project_id: 'hidden', status: 'in_review' }),
                issueRow({ id: 'todo', number: 4, status: 'todo' }),
            ],
            {
                issue_comments: [{ id: 'c1', workspace_id: WORKSPACE, issue_id: 'review', author_user_id: null, author_agent_id: 'scout', body: 'Ready for a look.', created_at: '2026-11-10T00:00:00.000Z' }],
                activity_events: [{ id: 'e1', workspace_id: WORKSPACE, issue_id: 'review', action: 'issue.status_changed', actor_user_id: null, actor_agent_id: 'scout', metadata: { from: 'in_progress', to: 'in_review' }, created_at: '2026-11-10T00:01:00.000Z' }],
            },
        )

        const queue = await listReviewQueue(scope, 'me', new Set(['project-1', 'other']))

        expect(queue.toReview.map(item => item.issue.id)).toEqual(['review', 'other-review'])
        expect(queue.toReview[0]).toMatchObject({ mine: true, handedBy: { kind: 'agent', agentId: 'scout' }, lastComment: { body: 'Ready for a look.' } })
        expect(queue.blocked).toEqual([expect.objectContaining({ blockedReason: 'Waiting for the CMS export.', mine: false })])
    })

    it('reads nothing more when nothing waits', async () => {
        const { scope } = setup([issueRow()])
        await expect(listReviewQueue(scope, 'me', 'all')).resolves.toEqual({ toReview: [], blocked: [] })
    })
})

describe('the verdicts', () => {
    it('approves an issue in review to done', async () => {
        const { rows, scope } = setup([issueRow({ id: 'review', status: 'in_review' })])
        const issue = await approveIssue(scope, { issueId: 'review', author: ME })
        expect(issue.status).toBe('done')
        expect(rows.activity_events.map(event => event.metadata)).toEqual([expect.objectContaining({ from: 'in_review', to: 'done' })])
    })

    it('refuses to approve what is no longer in review', async () => {
        const { scope } = setup([issueRow({ id: 'review', status: 'in_progress' })])
        await expect(approveIssue(scope, { issueId: 'review', author: ME })).rejects.toMatchObject({ code: 'issueNoLongerInReview' })
    })

    it('posts the requested changes before sending the issue back to work', async () => {
        const { rows, scope } = setup([issueRow({ id: 'review', status: 'in_review', assignee_agent_id: 'scout' })])
        const issue = await requestChanges(scope, { issueId: 'review', author: ME }, 'Use the brand colors for the menu.')
        expect(issue.status).toBe('in_progress')
        expect(rows.issue_comments).toEqual([expect.objectContaining({ body: 'Use the brand colors for the menu.', author_user_id: 'me' })])
        expect(rows.activity_events.map(event => event.action)).toEqual(['issue.commented', 'issue.status_changed'])
        expect(vi.mocked(reactToIssueChange).mock.calls.map(([, change]) => change.kind)).toEqual(['commented', 'status'])
    })

    it('asks for a comment before requesting changes, and changes nothing without one', async () => {
        const { rows, scope } = setup([issueRow({ id: 'review', status: 'in_review' })])
        await expect(requestChanges(scope, { issueId: 'review', author: ME }, '   ')).rejects.toMatchObject({ code: 'commentRequired' })
        expect(rows.issues[0].status).toBe('in_review')
    })

    it('unblocks to todo, with the comment only when there is one', async () => {
        const { rows, scope } = setup([issueRow({ id: 'a', status: 'blocked', blocked_reason: 'Waiting.' }), issueRow({ id: 'b', number: 2, status: 'blocked' })])
        await unblockIssue(scope, { issueId: 'a', author: ME }, 'The export is in the shared folder.')
        await unblockIssue(scope, { issueId: 'b', author: ME }, '  ')
        expect(rows.issues.map(issue => [issue.id, issue.status, issue.blocked_reason])).toEqual([
            ['a', 'todo', null],
            ['b', 'todo', null],
        ])
        expect(rows.issue_comments).toHaveLength(1)
        await expect(unblockIssue(scope, { issueId: 'a', author: ME })).rejects.toMatchObject({ code: 'issueNoLongerBlocked' })
    })
})
