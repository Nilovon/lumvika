import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizationError } from '@/app/api/_auth/errors'
import { AppError } from '@/lib/i18n/action-error'

const mocks = vi.hoisted(() => ({
    requireLightSessionActor: vi.fn(),
    assertAgentAccess: vi.fn(),
    assertProjectAccess: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
    restoreProject: vi.fn(),
    listProjects: vi.fn(),
    getProjectByKey: vi.fn(),
    listProjectMembers: vi.fn(),
    grantProjectMember: vi.fn(),
    revokeProjectMember: vi.fn(),
    resolveMemberIdentities: vi.fn(),
    selectMaybeSingle: vi.fn(),
    selectAll: vi.fn(),
}))

vi.mock('@/app/api/_auth/access', async importOriginal => ({ ...(await importOriginal<typeof import('@/app/api/_auth/access')>()), requireLightSessionActor: mocks.requireLightSessionActor, assertAgentAccess: mocks.assertAgentAccess }))
vi.mock('@/app/api/_auth/project-access', () => ({ assertProjectAccess: mocks.assertProjectAccess, PROJECT_NOT_FOUND: 'projectNotFound' }))
vi.mock('@/app/api/_services/work/projects.service', () => ({
    createProject: mocks.createProject,
    updateProject: mocks.updateProject,
    archiveProject: mocks.archiveProject,
    restoreProject: mocks.restoreProject,
    listProjects: mocks.listProjects,
    getProjectByKey: mocks.getProjectByKey,
    listProjectMembers: mocks.listProjectMembers,
    grantProjectMember: mocks.grantProjectMember,
    revokeProjectMember: mocks.revokeProjectMember,
}))
vi.mock('@/app/api/_services/members.service', () => ({ resolveMemberIdentities: mocks.resolveMemberIdentities }))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: () => ({}) }))
vi.mock('@/supabase/supabase-helpers', () => ({ selectMaybeSingle: mocks.selectMaybeSingle, selectAll: mocks.selectAll }))

const actions = await import('./projects.actions')

const WORKSPACE_ID = 7
const ME = 'user-me'
const ACTOR = { kind: 'user', userId: ME, workspaceId: WORKSPACE_ID, role: 'member', boxScope: 'all' } as const
const SCOPE = { workspaceId: WORKSPACE_ID }
const AUTHOR = { kind: 'user', userId: ME }

beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireLightSessionActor.mockResolvedValue(ACTOR)
    mocks.assertProjectAccess.mockResolvedValue({ actor: ACTOR, access: 'manage', project: { id: 'p1', workspace_id: WORKSPACE_ID, key: 'ENG', visibility: 'workspace', archived_at: null } })
})

describe('listProjectsAction', () => {
    it('lists what the caller sees, archived projects only when asked', async () => {
        mocks.listProjects.mockResolvedValue([{ id: 'p1' }])

        await expect(actions.listProjectsAction({ includeArchived: true })).resolves.toEqual({ ok: true, projects: [{ id: 'p1' }] })
        expect(mocks.listProjects).toHaveBeenCalledWith(SCOPE, ACTOR, { includeArchived: true })
    })

    it('turns a missing session into a refusal', async () => {
        mocks.requireLightSessionActor.mockRejectedValue(new AuthorizationError('notAuthenticated'))

        await expect(actions.listProjectsAction()).resolves.toMatchObject({ ok: false, code: 'notAuthenticated' })
    })
})

describe('getProjectAction', () => {
    it('answers not found for a project the caller cannot see', async () => {
        mocks.getProjectByKey.mockResolvedValue(null)

        await expect(actions.getProjectAction('eng')).resolves.toMatchObject({ ok: false, code: 'projectNotFound' })
        expect(mocks.getProjectByKey).toHaveBeenCalledWith(SCOPE, ACTOR, 'eng')
    })
})

describe('checkProjectKeyAction', () => {
    it('refuses a key the pattern does not allow without reading', async () => {
        await expect(actions.checkProjectKeyAction('1AB')).resolves.toEqual({ ok: true, check: 'invalid' })
        expect(mocks.selectMaybeSingle).not.toHaveBeenCalled()
    })

    it('reads the key in capitals within the workspace', async () => {
        mocks.selectMaybeSingle.mockResolvedValue({ data: { id: 'p1' } })

        await expect(actions.checkProjectKeyAction(' eng ')).resolves.toEqual({ ok: true, check: 'taken' })
        expect(mocks.selectMaybeSingle).toHaveBeenCalledWith(expect.anything(), 'projects', ['id'], { workspace_id: WORKSPACE_ID, key: 'ENG' })
    })

    it('says a free key is available', async () => {
        mocks.selectMaybeSingle.mockResolvedValue({ data: null })

        await expect(actions.checkProjectKeyAction('OPS')).resolves.toEqual({ ok: true, check: 'available' })
    })
})

describe('createProjectAction', () => {
    it('creates the project as the caller and hands back its key', async () => {
        mocks.createProject.mockResolvedValue({ id: 'p9', key: 'OPS' })
        const input = { name: 'Operations', key: 'OPS' }

        await expect(actions.createProjectAction(input)).resolves.toEqual({ ok: true, projectId: 'p9', key: 'OPS' })
        expect(mocks.createProject).toHaveBeenCalledWith(SCOPE, AUTHOR, input)
    })

    it('sends a taken key back as its code', async () => {
        mocks.createProject.mockRejectedValue(new AppError('projectKeyTaken', { key: 'OPS' }))

        await expect(actions.createProjectAction({ name: 'Operations', key: 'OPS' })).resolves.toEqual({ ok: false, code: 'projectKeyTaken', params: { key: 'OPS' }, error: 'Another project already uses the key OPS.' })
    })
})

describe('naming a coworker as lead', () => {
    const LEAD = { kind: 'agent', agentId: 'agent-hidden' } as const

    it('needs use of the coworker, on create and on update', async () => {
        mocks.createProject.mockResolvedValue({ id: 'p9', key: 'OPS' })

        await expect(actions.createProjectAction({ name: 'Operations', key: 'OPS', lead: LEAD })).resolves.toMatchObject({ ok: true })
        await expect(actions.updateProjectAction('p1', { lead: LEAD })).resolves.toEqual({ ok: true })
        expect(mocks.assertAgentAccess.mock.calls).toEqual([
            ['agent-hidden', 'use', ACTOR],
            ['agent-hidden', 'use', ACTOR],
        ])
    })

    it('answers a coworker the caller cannot use like an unknown one, and writes nothing', async () => {
        mocks.assertAgentAccess.mockRejectedValue(new AuthorizationError('coworkerNotFound'))

        await expect(actions.createProjectAction({ name: 'Operations', key: 'OPS', lead: LEAD })).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
        await expect(actions.updateProjectAction('p1', { lead: LEAD })).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
        expect(mocks.createProject).not.toHaveBeenCalled()
        expect(mocks.updateProject).not.toHaveBeenCalled()
    })

    it('asks nothing of a Box for a person lead', async () => {
        await actions.updateProjectAction('p1', { lead: { kind: 'user', userId: 'user-2' } })
        expect(mocks.assertAgentAccess).not.toHaveBeenCalled()
    })
})

describe('the manage-only actions', () => {
    it('assert manage before they touch the project', async () => {
        await actions.updateProjectAction('p1', { name: 'Renamed' })
        await actions.archiveProjectAction('p1')
        await actions.restoreProjectAction('p1')
        await actions.revokeProjectAccessAction('p1', 'user-2')

        for (const call of mocks.assertProjectAccess.mock.calls) expect(call).toEqual(['p1', 'manage'])
        expect(mocks.updateProject).toHaveBeenCalledWith(SCOPE, AUTHOR, 'p1', { name: 'Renamed' })
        expect(mocks.archiveProject).toHaveBeenCalledWith(SCOPE, AUTHOR, 'p1')
        expect(mocks.restoreProject).toHaveBeenCalledWith(SCOPE, AUTHOR, 'p1')
        expect(mocks.revokeProjectMember).toHaveBeenCalledWith(SCOPE, AUTHOR, 'p1', 'user-2')
    })

    it('change nothing when the caller only uses the project', async () => {
        mocks.assertProjectAccess.mockRejectedValue(new AppError('projectManagerOnly'))

        await expect(actions.archiveProjectAction('p1')).resolves.toMatchObject({ ok: false, code: 'projectManagerOnly' })
        await expect(actions.grantProjectAccessAction('p1', ['user-2'], 'use')).resolves.toMatchObject({ ok: false, code: 'projectManagerOnly' })
        expect(mocks.archiveProject).not.toHaveBeenCalled()
        expect(mocks.grantProjectMember).not.toHaveBeenCalled()
    })
})

describe('grantProjectAccessAction', () => {
    it('grants each person once', async () => {
        await expect(actions.grantProjectAccessAction('p1', ['user-2', 'user-3', 'user-2'], 'manage')).resolves.toEqual({ ok: true })

        expect(mocks.grantProjectMember.mock.calls).toEqual([
            [SCOPE, AUTHOR, 'p1', { userId: 'user-2', access: 'manage' }],
            [SCOPE, AUTHOR, 'p1', { userId: 'user-3', access: 'manage' }],
        ])
    })

    it('refuses an empty or oversized list before granting anyone', async () => {
        const crowd = Array.from({ length: 501 }, (_, index) => `user-${index}`)

        await expect(actions.grantProjectAccessAction('p1', crowd, 'use')).resolves.toMatchObject({ ok: false, code: 'invalidInput' })
        await expect(actions.grantProjectAccessAction('p1', [], 'use')).resolves.toMatchObject({ ok: false, code: 'invalidInput' })
        expect(mocks.grantProjectMember).not.toHaveBeenCalled()
    })
})

describe('getProjectAccessAction', () => {
    it('lists the people named on the project and the members to pick from', async () => {
        mocks.listProjectMembers.mockResolvedValue([{ project_id: 'p1', user_id: 'user-2', workspace_id: WORKSPACE_ID, access: 'use', granted_by: ME, created_at: '2026-11-10T10:00:00Z' }])
        mocks.selectAll.mockResolvedValue({
            data: [
                { user_id: ME, role: 'admin' },
                { user_id: 'user-2', role: 'member' },
            ],
        })
        mocks.resolveMemberIdentities.mockResolvedValue(new Map([['user-2', { email: 'two@acme.test', name: 'Two', avatarUrl: null }]]))

        await expect(actions.getProjectAccessAction('p1')).resolves.toEqual({
            ok: true,
            projectId: 'p1',
            people: [{ userId: 'user-2', access: 'use', grantedBy: ME, createdAt: '2026-11-10T10:00:00Z' }],
            members: [
                { userId: ME, email: null, role: 'admin' },
                { userId: 'user-2', email: 'two@acme.test', role: 'member' },
            ],
        })
    })
})
