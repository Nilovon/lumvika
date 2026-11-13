import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))

const { projectAccessOf } = await import('@/app/api/_auth/project-access')
const { archiveProject, createProject, getProjectByKey, grantProjectMember, listProjects, revokeProjectMember, updateProject } = await import('./projects.service')

type Actor = import('@/app/api/_auth/access').Actor

const WORKSPACE = 7
const ME = { kind: 'user', userId: 'me' } as const
const member: Actor = { kind: 'user', userId: 'me', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' }

function project(overrides: Row = {}): Row {
    return {
        id: 'project-1',
        workspace_id: WORKSPACE,
        key: 'ENG',
        name: 'Engineering',
        description: null,
        instructions: 'Ship small.',
        status: 'active',
        visibility: 'workspace',
        team_id: null,
        goal_id: null,
        lead_user_id: null,
        lead_agent_id: null,
        monthly_budget_micros: null,
        target_date: null,
        created_by: 'me',
        archived_at: null,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z',
        ...overrides,
    }
}

function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = { projects: [], project_members: [], issues: [], activity_events: [], workspace_members: [{ user_id: 'me', workspace_id: WORKSPACE }, { user_id: 'teammate', workspace_id: WORKSPACE }], teams: [], goals: [], ...tables }
    const db = workDatabase(rows, {
        rpc: {
            project_issue_counts: () => {
                const counts = new Map<string, Row>()
                for (const issue of rows.issues) {
                    const key = `${issue.project_id}:${issue.status}`
                    const row = counts.get(key) ?? { project_id: issue.project_id, status: issue.status, issue_count: 0 }
                    row.issue_count = (row.issue_count as number) + 1
                    counts.set(key, row)
                }
                return [...counts.values()]
            },
        },
    })
    return { db, rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
}

beforeEach(() => vi.clearAllMocks())

describe('createProject', () => {
    it('refuses a key another project of the workspace holds', async () => {
        const { db, scope } = setup({ projects: [project()] })
        await expect(createProject(scope, ME, { key: 'eng', name: 'Again' })).rejects.toMatchObject({ code: 'projectKeyTaken', params: { key: 'ENG' } })
        await expect(createProject(scope, ME, { key: 'E', name: 'Short' })).rejects.toMatchObject({ code: 'projectKeyInvalid' })
        expect(db.writes('projects')).toHaveLength(0)
    })

    it('names its creator manager of a restricted project and logs it', async () => {
        const { db, rows, scope } = setup()

        const created = await createProject(scope, ME, { key: 'ops', name: 'Operations', visibility: 'restricted', lead: { kind: 'user', userId: 'teammate' } })

        expect(db.writes('projects')[0].payload).toMatchObject({ key: 'OPS', status: 'active', visibility: 'restricted', lead_user_id: 'teammate', lead_agent_id: null, created_by: 'me' })
        expect(rows.project_members).toEqual([expect.objectContaining({ project_id: created.id, user_id: 'me', access: 'manage' })])
        expect(rows.activity_events[0]).toMatchObject({ action: 'project.created', entity_id: created.id, project_id: created.id })
    })

    it('refuses a team of another workspace', async () => {
        const { scope } = setup({ teams: [{ id: 'team-x', workspace_id: 99 }] })
        await expect(createProject(scope, ME, { key: 'OPS', name: 'Ops', teamId: 'team-x' })).rejects.toMatchObject({ code: 'teamNotFound' })
    })

    it('needs no row for an agent', async () => {
        const { rows, scope } = setup()
        await createProject(scope, { kind: 'agent', agentId: 'agent-1' }, { key: 'BOT', name: 'Bots', visibility: 'restricted' })
        expect(rows.project_members).toEqual([])
    })

    it('lets a member who creates a project open to the workspace manage it, and one scoped to their Boxes open it', async () => {
        for (const boxScope of ['all', 'assigned'] as const) {
            const { rows, scope } = setup()
            const created = await createProject(scope, ME, { key: 'OPEN', name: 'Open' })
            const grant = rows.project_members.find(row => row.project_id === created.id && row.user_id === 'me')
            expect(grant).toMatchObject({ access: 'manage' })
            const member: Actor = { kind: 'user', userId: 'me', workspaceId: created.workspace_id, role: 'member', boxScope }
            expect(projectAccessOf(member, created, grant!.access as 'manage')).toBe('manage')
            expect(projectAccessOf(member, created, null)).toBe(boxScope === 'all' ? 'use' : 'none')
        }
    })
})

describe('updateProject and archiveProject', () => {
    it('writes only what changed', async () => {
        const { db, rows, scope } = setup({ projects: [project()] })
        await updateProject(scope, ME, 'project-1', { instructions: 'Ship daily.' })
        expect(db.writes('projects')[0].payload).toEqual({ instructions: 'Ship daily.' })
        expect(rows.activity_events[0]).toMatchObject({ action: 'project.updated', metadata: { fields: ['instructions'] } })
    })

    it('archives with a timestamp', async () => {
        const { rows, scope } = setup({ projects: [project()] })
        const archived = await archiveProject(scope, ME, 'project-1')
        expect(archived).toMatchObject({ status: 'archived', archived_at: expect.any(String) })
        expect(rows.activity_events[0].action).toBe('project.archived')
    })

    it('reads a project of another workspace as missing', async () => {
        const { scope } = setup({ projects: [project({ workspace_id: 99 })] })
        await expect(updateProject(scope, ME, 'project-1', { name: 'x' })).rejects.toMatchObject({ code: 'projectNotFound' })
    })
})

describe('listProjects and getProjectByKey', () => {
    it('lists what the actor sees with its issue counts', async () => {
        const { scope } = setup({
            projects: [project(), project({ id: 'project-2', key: 'SHUT', visibility: 'restricted' }), project({ id: 'project-3', key: 'OLD', archived_at: '2026-10-01T00:00:00.000Z' })],
            issues: [
                { project_id: 'project-1', status: 'todo', workspace_id: WORKSPACE },
                { project_id: 'project-1', status: 'todo', workspace_id: WORKSPACE },
                { project_id: 'project-1', status: 'done', workspace_id: WORKSPACE },
            ],
        })

        const listed = await listProjects(scope, member)

        expect(listed).toEqual([expect.objectContaining({ key: 'ENG', access: 'use', issueCounts: { todo: 2, done: 1 }, lead: null })])
    })

    it('hides a project the actor cannot see', async () => {
        const { scope } = setup({ projects: [project({ visibility: 'restricted' })] })
        await expect(getProjectByKey(scope, member, 'eng')).resolves.toBeNull()
    })

    it('hands back the detail with its members', async () => {
        const { scope } = setup({ projects: [project({ visibility: 'restricted' })], project_members: [{ project_id: 'project-1', user_id: 'me', workspace_id: WORKSPACE, access: 'manage', granted_by: null, created_at: 'then' }] })
        await expect(getProjectByKey(scope, member, 'ENG')).resolves.toMatchObject({ key: 'ENG', access: 'manage', instructions: 'Ship small.', members: [{ userId: 'me', access: 'manage' }] })
    })
})

describe('project members', () => {
    it('grants a member of the workspace and revokes them', async () => {
        const { rows, scope } = setup({ projects: [project()] })

        await expect(grantProjectMember(scope, ME, 'project-1', { userId: 'stranger', access: 'use' })).rejects.toMatchObject({ code: 'assigneeNotInWorkspace' })
        await grantProjectMember(scope, ME, 'project-1', { userId: 'teammate', access: 'use' })
        expect(rows.project_members).toEqual([expect.objectContaining({ user_id: 'teammate', access: 'use', granted_by: 'me' })])

        await revokeProjectMember(scope, ME, 'project-1', 'teammate')
        expect(rows.project_members).toEqual([])
        expect(rows.activity_events.map(event => event.action)).toEqual(['project.member_granted', 'project.member_revoked'])
    })
})
