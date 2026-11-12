import { describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row } from '@/test/work-fake'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))

const { listActivity, recordActivity } = await import('./activity.service')

const WORKSPACE = 7

function event(index: number, projectId: string | null): Row {
    return {
        id: `event-${index}`,
        workspace_id: WORKSPACE,
        project_id: projectId,
        issue_id: null,
        entity_type: 'project',
        entity_id: projectId ?? 'team-1',
        action: 'project.updated',
        actor_user_id: index % 2 ? 'me' : null,
        actor_agent_id: null,
        metadata: {},
        created_at: `2026-11-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`,
    }
}

describe('recordActivity', () => {
    it('writes the actor columns from the author', async () => {
        const rows = { activity_events: [] as Row[] }
        const db = workDatabase(rows)
        await recordActivity({ workspaceId: WORKSPACE, supabase: db.client }, { action: 'issue.checked_out', entityType: 'issue', entityId: 'issue-1', issueId: 'issue-1', projectId: 'project-1', author: { kind: 'agent', agentId: 'agent-1' }, metadata: { runId: 'run-1' } })
        expect(rows.activity_events[0]).toMatchObject({ workspace_id: WORKSPACE, actor_user_id: null, actor_agent_id: 'agent-1', metadata: { runId: 'run-1' } })
    })

    it('never fails the work it records', async () => {
        const db = workDatabase({}, { refuse: { activity_events: { message: 'down' } } })
        const log = vi.spyOn(console, 'error').mockImplementation(() => {})
        await expect(recordActivity({ workspaceId: WORKSPACE, supabase: db.client }, { action: 'project.created', entityType: 'project', entityId: 'p', author: { kind: 'system' } })).resolves.toBeUndefined()
        expect(log).toHaveBeenCalled()
        log.mockRestore()
    })
})

describe('listActivity', () => {
    const rows = { activity_events: [event(1, 'open'), event(2, 'hidden'), event(3, null), event(4, 'hidden'), event(5, 'open')] }

    it('pages newest first and leaves out projects the actor does not see', async () => {
        const db = workDatabase(rows)
        const scope = { workspaceId: WORKSPACE, supabase: db.client }

        const first = await listActivity(scope, { limit: 2 }, new Set(['open']))
        expect(first.events.map(item => item.id)).toEqual(['event-5', 'event-3'])
        expect(first.nextCursor).toBe('2026-11-13T00:00:00.000Z')

        const second = await listActivity(scope, { limit: 2, before: first.nextCursor! }, new Set(['open']))
        expect(second.events.map(item => item.id)).toEqual(['event-1'])
        expect(second.nextCursor).toBeNull()
        expect(second.events[0].actor).toEqual({ kind: 'user', userId: 'me' })
    })

    it('answers nothing for a project the actor does not see', async () => {
        const db = workDatabase(rows)
        await expect(listActivity({ workspaceId: WORKSPACE, supabase: db.client }, { projectId: 'hidden' }, new Set(['open']))).resolves.toEqual({ events: [], nextCursor: null })
        expect(db.calls).toHaveLength(0)
    })
})
