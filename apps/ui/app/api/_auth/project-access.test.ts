import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Tables } from '@/test/work-fake'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/supabase/session/getServerSession', () => ({ getSessionWorkspace: vi.fn(), getServerSession: vi.fn() }))

const { createServiceRoleClient } = await import('@/supabase/serviceRole')
const { AccessDeniedError } = await import('@/app/api/_auth/access')
const { assertChannelAccess, assertIssueAccess, assertProjectAccess, channelAccessOf, projectAccessOf, visibleChannelIds, visibleProjectIds } = await import('./project-access')

type Actor = import('@/app/api/_auth/access').Actor

const WORKSPACE = 7
const admin: Actor = { kind: 'user', userId: 'admin', workspaceId: WORKSPACE, role: 'admin', boxScope: 'assigned' }
const full: Actor = { kind: 'user', userId: 'full', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' }
const assigned: Actor = { kind: 'user', userId: 'assigned', workspaceId: WORKSPACE, role: 'member', boxScope: 'assigned' }
const workspace: Actor = { kind: 'workspace', workspaceId: WORKSPACE }
const outsider: Actor = { kind: 'user', userId: 'outsider', workspaceId: 99, role: 'admin', boxScope: 'all' }

const open = { workspace_id: WORKSPACE, visibility: 'workspace' }
const restricted = { workspace_id: WORKSPACE, visibility: 'restricted' }

describe('projectAccessOf', () => {
    it('gives admins and the workspace itself manage on every project', () => {
        expect(projectAccessOf(admin, restricted, null)).toBe('manage')
        expect(projectAccessOf(workspace, restricted, null)).toBe('manage')
    })

    it('opens a workspace project to members scoped to all, and only them', () => {
        expect(projectAccessOf(full, open, null)).toBe('use')
        expect(projectAccessOf(assigned, open, null)).toBe('none')
    })

    it('hides a restricted project from anyone not named on it', () => {
        expect(projectAccessOf(full, restricted, null)).toBe('none')
        expect(projectAccessOf(full, restricted, 'use')).toBe('use')
        expect(projectAccessOf(assigned, restricted, 'manage')).toBe('manage')
    })

    it('never reaches a project of another workspace', () => {
        expect(projectAccessOf(outsider, open, 'manage')).toBe('none')
    })
})

describe('channelAccessOf', () => {
    const publicChannel = { workspace_id: WORKSPACE, kind: 'public', created_by: 'creator' }
    const privateChannel = { workspace_id: WORKSPACE, kind: 'private', created_by: 'full' }
    const dm = { workspace_id: WORKSPACE, kind: 'dm', created_by: 'full' }

    it('opens a public channel to admins and members scoped to all', () => {
        expect(channelAccessOf(admin, publicChannel, false)).toBe('manage')
        expect(channelAccessOf(full, publicChannel, false)).toBe('use')
        expect(channelAccessOf(assigned, publicChannel, false)).toBe('none')
        expect(channelAccessOf(assigned, publicChannel, true)).toBe('use')
    })

    it('keeps a private channel and a direct message to their members, admins included', () => {
        expect(channelAccessOf(admin, privateChannel, false)).toBe('none')
        expect(channelAccessOf(admin, privateChannel, true)).toBe('manage')
        expect(channelAccessOf(full, privateChannel, true)).toBe('manage')
        expect(channelAccessOf(assigned, privateChannel, true)).toBe('use')
        expect(channelAccessOf(full, dm, true)).toBe('use')
        expect(channelAccessOf(full, dm, false)).toBe('none')
    })

    it('lets the workspace itself reach every channel of its own workspace only', () => {
        expect(channelAccessOf(workspace, dm, false)).toBe('manage')
        expect(channelAccessOf(outsider, publicChannel, true)).toBe('none')
    })
})

function database(tables: Tables) {
    const db = workDatabase(tables)
    vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
    return db
}

describe('the guards', () => {
    beforeEach(() => {
        database({
            projects: [
                { id: 'p-open', workspace_id: WORKSPACE, key: 'OPEN', visibility: 'workspace', archived_at: null },
                { id: 'p-closed', workspace_id: WORKSPACE, key: 'SHUT', visibility: 'restricted', archived_at: null },
                { id: 'p-shared', workspace_id: WORKSPACE, key: 'SHRD', visibility: 'restricted', archived_at: null },
                { id: 'p-other', workspace_id: 99, key: 'OTHR', visibility: 'workspace', archived_at: null },
            ],
            project_members: [{ project_id: 'p-shared', user_id: 'full', workspace_id: WORKSPACE, access: 'use' }],
            issues: [
                { id: 'i-closed', workspace_id: WORKSPACE, project_id: 'p-closed', number: 1 },
                { id: 'i-open', workspace_id: WORKSPACE, project_id: 'p-open', number: 1 },
            ],
            channels: [
                { id: 'c-public', workspace_id: WORKSPACE, kind: 'public', created_by: 'admin', archived_at: null },
                { id: 'c-private', workspace_id: WORKSPACE, kind: 'private', created_by: 'admin', archived_at: null },
            ],
            channel_members: [{ id: 'm1', channel_id: 'c-private', workspace_id: WORKSPACE, user_id: 'assigned' }],
        })
    })

    it('reads a hidden project as missing and a used one as refusing to be managed', async () => {
        await expect(assertProjectAccess('p-closed', 'use', full)).rejects.toMatchObject({ code: 'projectNotFound' })
        await expect(assertProjectAccess('p-other', 'use', full)).rejects.toMatchObject({ code: 'projectNotFound' })
        await expect(assertProjectAccess('p-shared', 'manage', full)).rejects.toBeInstanceOf(AccessDeniedError)
        await expect(assertProjectAccess('p-shared', 'use', full)).resolves.toMatchObject({ access: 'use', project: { key: 'SHRD' } })
    })

    it('resolves an issue through its project', async () => {
        await expect(assertIssueAccess('i-closed', 'use', full)).rejects.toMatchObject({ code: 'issueNotFound' })
        await expect(assertIssueAccess('i-open', 'use', full)).resolves.toMatchObject({ access: 'use', issue: { project_id: 'p-open' } })
        await expect(assertIssueAccess('i-closed', 'manage', workspace)).resolves.toMatchObject({ access: 'manage' })
    })

    it('lists the projects an actor sees', async () => {
        await expect(visibleProjectIds(admin)).resolves.toBe('all')
        expect(await visibleProjectIds(full)).toEqual(new Set(['p-open', 'p-shared']))
        expect(await visibleProjectIds(assigned)).toEqual(new Set())
    })

    it('guards channels by kind and membership', async () => {
        await expect(assertChannelAccess('c-private', 'use', admin)).rejects.toMatchObject({ code: 'channelNotFound' })
        await expect(assertChannelAccess('c-private', 'use', assigned)).resolves.toMatchObject({ access: 'use' })
        await expect(assertChannelAccess('c-private', 'manage', assigned)).rejects.toMatchObject({ code: 'channelManagerOnly' })
        expect(await visibleChannelIds(full)).toEqual(new Set(['c-public']))
        expect(await visibleChannelIds(assigned)).toEqual(new Set(['c-private']))
        await expect(visibleChannelIds(workspace)).resolves.toBe('all')
    })
})
