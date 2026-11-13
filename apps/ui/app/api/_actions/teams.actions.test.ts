import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn() }))

vi.mock('@/supabase/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))

const { createServiceRoleClient } = await import('@/supabase/serviceRole')
const { addTeamMemberAction, createTeamAction, deleteTeamAction, listTeamsAction, removeTeamMemberAction, setTeamMemberRoleAction, updateTeamAction } = await import('./teams.actions')

const WORKSPACE = 7
const ME = 'user-me'

function signedInAs(role: 'admin' | 'member', tables: Partial<Tables> = {}) {
    mocks.getServerSession.mockResolvedValue({ user: { id: ME, workspace_id: WORKSPACE }, workspace: { id: WORKSPACE, name: 'Acme' }, session: { id: ME, email: 'me@acme.test' }, workspaceRefused: false })
    const rows: Tables = {
        workspace_members: [
            { user_id: ME, workspace_id: WORKSPACE, role, box_scope: 'all' },
            { user_id: 'teammate', workspace_id: WORKSPACE, role: 'member', box_scope: 'all' },
        ],
        teams: [{ id: 'team-1', workspace_id: WORKSPACE, name: 'Growth', description: null, color: null, created_at: 'then', updated_at: 'then' }],
        team_members: [],
        projects: [],
        project_members: [],
        spaces: [
            { id: 'box-open', workspace_id: WORKSPACE, visibility: 'workspace' },
            { id: 'box-shut', workspace_id: WORKSPACE, visibility: 'restricted' },
        ],
        space_members: [],
        agents: [
            { id: 'agent-1', workspace_id: WORKSPACE, space_id: 'box-open' },
            { id: 'agent-shut', workspace_id: WORKSPACE, space_id: 'box-shut' },
        ],
        activity_events: [],
        ...tables,
    }
    const db = workDatabase(rows)
    vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
    return { db, rows }
}

function teamMember(overrides: Row = {}): Row {
    return { id: 'tm-1', team_id: 'team-1', workspace_id: WORKSPACE, user_id: ME, agent_id: null, role: 'member', created_at: '2026-01-01T00:00:00.000Z', updated_at: 'then', ...overrides }
}

beforeEach(() => vi.clearAllMocks())

describe('teams actions', () => {
    it('lets any member read the teams', async () => {
        signedInAs('member')
        await expect(listTeamsAction()).resolves.toMatchObject({ ok: true, teams: [{ id: 'team-1', name: 'Growth', members: [], projects: [] }] })
    })

    it('keeps creating, editing and deleting a team to admins', async () => {
        const { rows } = signedInAs('member')
        await expect(createTeamAction({ name: 'Ops' })).resolves.toMatchObject({ ok: false, code: 'adminOnly' })
        await expect(updateTeamAction('team-1', { name: 'Ops' })).resolves.toMatchObject({ ok: false, code: 'adminOnly' })
        await expect(deleteTeamAction('team-1')).resolves.toMatchObject({ ok: false, code: 'adminOnly' })
        expect(rows.teams).toHaveLength(1)
    })

    it('creates a team as an admin, written as the admin', async () => {
        const { rows } = signedInAs('admin')
        await expect(createTeamAction({ name: 'Ops', color: '#16a34a' })).resolves.toMatchObject({ ok: true, team: { name: 'Ops', color: '#16a34a' } })
        expect(rows.activity_events[0]).toMatchObject({ action: 'team.created', actor_user_id: ME })
    })

    it('refuses a member who does not lead the team to change who is on it', async () => {
        const { rows } = signedInAs('member', { team_members: [teamMember()] })
        await expect(addTeamMemberAction('team-1', { member: { kind: 'agent', agentId: 'agent-1' } })).resolves.toMatchObject({ ok: false, code: 'teamManagerOnly' })
        await expect(removeTeamMemberAction('team-1', 'tm-1')).resolves.toMatchObject({ ok: false, code: 'teamManagerOnly' })
        expect(rows.team_members).toHaveLength(1)
    })

    it('lets the person leading the team manage its members, and only its members', async () => {
        const { rows } = signedInAs('member', { team_members: [teamMember({ role: 'lead' })] })

        const added = await addTeamMemberAction('team-1', { member: { kind: 'agent', agentId: 'agent-1' } })
        expect(added).toMatchObject({ ok: true, team: { members: [{ role: 'lead' }, { member: { kind: 'agent', agentId: 'agent-1' }, role: 'member' }] } })

        const coworkerRow = rows.team_members.find(row => row.agent_id === 'agent-1') as Row
        await expect(setTeamMemberRoleAction('team-1', coworkerRow.id as string, 'member')).resolves.toMatchObject({ ok: true })
        await expect(removeTeamMemberAction('team-1', coworkerRow.id as string)).resolves.toMatchObject({ ok: true })
        await expect(updateTeamAction('team-1', { name: 'Renamed' })).resolves.toMatchObject({ ok: false, code: 'adminOnly' })
    })

    it('never shows nor lets a lead touch a coworker of a Box they cannot see, without saying it exists', async () => {
        const { rows } = signedInAs('member', { team_members: [teamMember({ role: 'lead' }), teamMember({ id: 'tm-shut', user_id: null, agent_id: 'agent-shut' })] })

        const listed = await listTeamsAction()
        expect(listed).toMatchObject({ ok: true, teams: [{ members: [{ id: 'tm-1' }] }] })
        expect(JSON.stringify(listed)).not.toContain('agent-shut')

        await expect(addTeamMemberAction('team-1', { member: { kind: 'agent', agentId: 'agent-shut' } })).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
        await expect(removeTeamMemberAction('team-1', 'tm-shut')).resolves.toMatchObject({ ok: false, code: 'teamMemberNotFound' })
        await expect(setTeamMemberRoleAction('team-1', 'tm-shut', 'lead')).resolves.toMatchObject({ ok: false, code: 'teamMemberNotFound' })
        expect(rows.team_members).toHaveLength(2)

        const added = await addTeamMemberAction('team-1', { member: { kind: 'agent', agentId: 'agent-1' } })
        expect(added.ok && added.team.members.map(entry => entry.id)).not.toContain('tm-shut')
    })

    it('shows an admin every coworker of the team', async () => {
        signedInAs('admin', { team_members: [teamMember({ id: 'tm-shut', user_id: null, agent_id: 'agent-shut' })] })
        await expect(listTeamsAction()).resolves.toMatchObject({ ok: true, teams: [{ members: [{ member: { kind: 'agent', agentId: 'agent-shut' } }] }] })
    })

    it('hands back the refusal of a member outside the workspace', async () => {
        signedInAs('admin')
        await expect(addTeamMemberAction('team-1', { member: { kind: 'user', userId: 'stranger' } })).resolves.toMatchObject({ ok: false, code: 'assigneeNotInWorkspace' })
    })
})
