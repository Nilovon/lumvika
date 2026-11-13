import { describe, expect, it, vi } from 'vitest'

import { workDatabase, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))
vi.mock('@/app/api/_services/work/issue-effects.service', () => ({ reactToIssueChange: vi.fn() }))

const { reactToIssueChange } = await import('@/app/api/_services/work/issue-effects.service')

const { addIssueComment, editIssueComment, listIssueComments } = await import('./issue-comments.service')

const WORKSPACE = 7

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = { issues: [{ id: 'issue-1', workspace_id: WORKSPACE, project_id: 'project-1' }], issue_comments: [], activity_events: [], ...tables }
    const db = workDatabase(rows)
    return { db, rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
}

describe('issue comments', () => {
    it('adds a comment signed by an agent and logs it on the issue', async () => {
        const { rows, scope } = setup()

        const comment = await addIssueComment(scope, { kind: 'agent', agentId: 'agent-1' }, 'issue-1', { body: '  Done, see the PR.  ' })

        expect(comment).toMatchObject({ issueId: 'issue-1', author: { kind: 'agent', agentId: 'agent-1' }, body: 'Done, see the PR.' })
        expect(rows.activity_events[0]).toMatchObject({ action: 'issue.commented', entity_type: 'issue_comment', entity_id: comment.id, issue_id: 'issue-1', project_id: 'project-1', actor_agent_id: 'agent-1' })
        expect(reactToIssueChange).toHaveBeenCalledWith(scope, { kind: 'commented', issueId: 'issue-1', body: 'Done, see the PR.', author: { kind: 'agent', agentId: 'agent-1' } })
    })

    it('refuses an empty comment and an issue of another workspace', async () => {
        const { db, scope } = setup({ issues: [{ id: 'issue-1', workspace_id: 99, project_id: 'project-1' }] })
        await expect(addIssueComment(scope, { kind: 'user', userId: 'me' }, 'issue-1', { body: '   ' })).rejects.toMatchObject({ code: 'commentRequired' })
        await expect(addIssueComment(scope, { kind: 'user', userId: 'me' }, 'issue-1', { body: 'Hi' })).rejects.toMatchObject({ code: 'issueNotFound' })
        expect(db.writes('issue_comments')).toHaveLength(0)
    })

    it('lets only the author edit, and marks the edit', async () => {
        const { db, rows, scope } = setup({ issue_comments: [{ id: 'comment-1', workspace_id: WORKSPACE, issue_id: 'issue-1', author_user_id: 'me', author_agent_id: null, body: 'First', edited_at: null, created_at: 'then' }] })

        await expect(editIssueComment(scope, { kind: 'user', userId: 'someone' }, 'comment-1', { body: 'Hijacked' })).rejects.toMatchObject({ code: 'commentAuthorOnly' })
        await expect(editIssueComment(scope, { kind: 'system' }, 'comment-1', { body: 'Hijacked' })).rejects.toMatchObject({ code: 'commentAuthorOnly' })
        expect(db.writes('issue_comments')).toHaveLength(0)

        const edited = await editIssueComment(scope, { kind: 'user', userId: 'me' }, 'comment-1', { body: 'Second' })
        expect(edited).toMatchObject({ body: 'Second', editedAt: expect.any(String) })
        expect(rows.activity_events[0].action).toBe('issue.comment_edited')
    })

    it('lists the comments of an issue oldest first', async () => {
        const { scope } = setup({
            issue_comments: [
                { id: 'b', workspace_id: WORKSPACE, issue_id: 'issue-1', author_user_id: null, author_agent_id: null, body: 'Later', created_at: '2026-11-02' },
                { id: 'a', workspace_id: WORKSPACE, issue_id: 'issue-1', author_user_id: 'me', author_agent_id: null, body: 'Earlier', created_at: '2026-11-01' },
            ],
        })
        const comments = await listIssueComments(scope, 'issue-1')
        expect(comments.map(comment => [comment.id, comment.author.kind])).toEqual([
            ['a', 'user'],
            ['b', 'system'],
        ])
    })
})
