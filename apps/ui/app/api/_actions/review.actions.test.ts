import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizationError } from '@/app/api/_auth/errors'
import { AppError } from '@/lib/i18n/action-error'

const mocks = vi.hoisted(() => ({
    requireLightSessionActor: vi.fn(),
    assertIssueAccess: vi.fn(),
    visibleProjectIds: vi.fn(),
    listReviewQueue: vi.fn(),
    approveIssue: vi.fn(),
    requestChanges: vi.fn(),
    unblockIssue: vi.fn(),
}))

vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/access')>()), requireLightSessionActor: mocks.requireLightSessionActor }))
vi.mock('@/app/api/_auth/project-access', () => ({ assertIssueAccess: mocks.assertIssueAccess, visibleProjectIds: mocks.visibleProjectIds }))
vi.mock('@/app/api/_services/work/review.service', () => ({ listReviewQueue: mocks.listReviewQueue, approveIssue: mocks.approveIssue, requestChanges: mocks.requestChanges, unblockIssue: mocks.unblockIssue }))

const actions = await import('./review.actions')

const ACTOR = { kind: 'user', userId: 'me', workspaceId: 7, role: 'member', boxScope: 'all' } as const
const SCOPE = { workspaceId: 7 }
const VERDICT = { issueId: 'i1', author: { kind: 'user', userId: 'me' } }

function record(status: string) {
    return { id: 'i1', project_id: 'p1', number: 12, title: 'Design the navigation', status, priority: 'high', assignee_user_id: null, assignee_agent_id: 'scout', parent_issue_id: null, goal_id: null, due_date: null, position: 1024, checkout_run_id: null, checked_out_at: null, started_at: null, completed_at: null, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', projectKey: 'WEB', ref: 'WEB-12' }
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireLightSessionActor.mockResolvedValue(ACTOR)
    mocks.assertIssueAccess.mockResolvedValue({ actor: ACTOR })
})

describe('listReviewQueueAction', () => {
    it('reads the queue of the projects the caller sees', async () => {
        const visible = new Set(['p1'])
        mocks.visibleProjectIds.mockResolvedValue(visible)
        mocks.listReviewQueue.mockResolvedValue({ toReview: [], blocked: [] })
        await expect(actions.listReviewQueueAction()).resolves.toEqual({ ok: true, queue: { toReview: [], blocked: [] } })
        expect(mocks.listReviewQueue).toHaveBeenCalledWith(SCOPE, 'me', visible)
    })
})

describe('the verdict actions', () => {
    it('guards the issue, then gives the verdict as the caller', async () => {
        mocks.approveIssue.mockResolvedValue(record('done'))
        const result = await actions.approveIssueAction('i1')
        expect(mocks.assertIssueAccess).toHaveBeenCalledWith('i1', 'use')
        expect(mocks.approveIssue).toHaveBeenCalledWith(SCOPE, VERDICT)
        expect(result).toMatchObject({ ok: true, issue: { ref: 'WEB-12', status: 'done' } })
    })

    it('passes the comment of a change request and of an unblock', async () => {
        mocks.requestChanges.mockResolvedValue(record('in_progress'))
        mocks.unblockIssue.mockResolvedValue(record('todo'))
        await actions.requestChangesAction('i1', 'Use the brand colors.')
        await actions.unblockIssueAction('i1')
        expect(mocks.requestChanges).toHaveBeenCalledWith(SCOPE, VERDICT, 'Use the brand colors.')
        expect(mocks.unblockIssue).toHaveBeenCalledWith(SCOPE, VERDICT, undefined)
    })

    it('never reaches the service for an issue the caller cannot see', async () => {
        mocks.assertIssueAccess.mockRejectedValue(new AuthorizationError('issueNotFound'))
        await expect(actions.approveIssueAction('i1')).resolves.toMatchObject({ ok: false, code: 'issueNotFound' })
        expect(mocks.approveIssue).not.toHaveBeenCalled()
    })

    it('sends a refusal of the service back as its code', async () => {
        mocks.requestChanges.mockRejectedValue(new AppError('commentRequired'))
        await expect(actions.requestChangesAction('i1', '')).resolves.toMatchObject({ ok: false, code: 'commentRequired' })
    })
})
