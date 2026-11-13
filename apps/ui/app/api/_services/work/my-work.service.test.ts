import { describe, expect, it, vi } from 'vitest'

import { workDatabase } from '@/test/work-fake'
import { issueRow, projectRow, WORKSPACE } from '@/test/work-rows'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))

const { listMyWork } = await import('./my-work.service')

function setup() {
    const db = workDatabase({
        projects: [projectRow(), projectRow({ id: 'led', key: 'WEB', name: 'Website', lead_user_id: 'me' }), projectRow({ id: 'hidden', key: 'SEC', name: 'Hidden' })],
        issues: [
            issueRow({ id: 'assigned', assignee_user_id: 'me', status: 'in_progress' }),
            issueRow({ id: 'assigned-done', number: 2, assignee_user_id: 'me', status: 'done' }),
            issueRow({ id: 'created-closed', number: 3, created_by_user_id: 'me', status: 'done', updated_at: '2026-11-09T00:00:00.000Z' }),
            issueRow({ id: 'created-to-scout', number: 4, created_by_user_id: 'me', assignee_agent_id: 'scout', status: 'todo' }),
            issueRow({ id: 'led-by-me', project_id: 'led', number: 1, created_by_user_id: 'ada', assignee_agent_id: 'quill', status: 'blocked', updated_at: '2026-11-08T00:00:00.000Z' }),
            issueRow({ id: 'led-closed', project_id: 'led', number: 2, assignee_agent_id: 'quill', status: 'done' }),
            issueRow({ id: 'hidden', project_id: 'hidden', assignee_user_id: 'me', created_by_user_id: 'me' }),
        ],
    })
    return { workspaceId: WORKSPACE, supabase: db.client }
}

describe('listMyWork', () => {
    it('lists what is mine, what I created and what my coworkers hold for me, in the projects I see', async () => {
        const work = await listMyWork(setup(), 'me', new Set(['project-1', 'led']))

        expect(work.assigned.map(issue => issue.id)).toEqual(['assigned'])
        expect(work.created.map(issue => issue.id)).toEqual(['created-to-scout', 'created-closed'])
        expect(work.delegated.map(issue => issue.id).sort()).toEqual(['created-to-scout', 'led-by-me'])
        expect(work.projects.map(project => project.key)).toEqual(['ENG', 'WEB'])
    })

    it('reads no coworker issue of a project I do not lead', async () => {
        const work = await listMyWork(setup(), 'ada', 'all')
        expect(work.delegated.map(issue => issue.id)).toEqual(['led-by-me'])
        expect(work.assigned).toEqual([])
    })
})
