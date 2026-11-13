import { describe, expect, it } from 'vitest'

import { issueCommentOfRow, issueSummaryOfRow, sameMember } from './issue-mappers'

const ROW = {
    id: 'i1',
    project_id: 'p1',
    number: 7,
    title: 'Draft the launch post',
    status: 'in_progress' as const,
    priority: 'high' as const,
    assignee_user_id: null,
    assignee_agent_id: 'agent-1',
    parent_issue_id: null,
    goal_id: null,
    due_date: '2026-11-20',
    position: 1024,
    checkout_run_id: 'run-1',
    checked_out_at: '2026-11-12T10:00:00Z',
    started_at: '2026-11-12T10:00:00Z',
    completed_at: null,
    created_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-12T10:00:00Z',
}

describe('issueSummaryOfRow', () => {
    it('reads a realtime row as the summary the server sends', () => {
        expect(issueSummaryOfRow(ROW, 'MKT')).toMatchObject({ ref: 'MKT-7', assignee: { kind: 'agent', agentId: 'agent-1' }, checkoutRunId: 'run-1', dueDate: '2026-11-20' })
    })

    it('reads nobody when neither assignee column is set', () => {
        expect(issueSummaryOfRow({ ...ROW, assignee_agent_id: null }, 'MKT').assignee).toBeNull()
    })
})

describe('issueCommentOfRow', () => {
    it('signs a comment whose author is gone as the system', () => {
        expect(issueCommentOfRow({ id: 'c1', issue_id: 'i1', author_user_id: null, author_agent_id: null, body: 'Hi', edited_at: null, created_at: '2026-11-12T10:00:00Z' }).author).toEqual({ kind: 'system' })
    })
})

describe('sameMember', () => {
    it('compares people and coworkers by id', () => {
        expect(sameMember({ kind: 'user', userId: 'a' }, { kind: 'user', userId: 'a' })).toBe(true)
        expect(sameMember({ kind: 'user', userId: 'a' }, { kind: 'agent', agentId: 'a' })).toBe(false)
        expect(sameMember(null, null)).toBe(true)
        expect(sameMember(null, { kind: 'user', userId: 'a' })).toBe(false)
    })
})
