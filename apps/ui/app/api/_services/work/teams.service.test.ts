import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))

const { addTeamMember, createTeam, deleteTeam, isTeamLead, listTeamOverviews, removeTeamMember, setTeamMemberRole, teamNamesByAgent, updateTeam, visibleTeam } = await import('./teams.service')

type Actor = import('@/app/api/_auth/access').Actor

const WORKSPACE = 7
const ME = { kind: 'user', userId: 'me' } as const
const member: Actor = { kind: 'user', userId: 'me', workspaceId: WORKSPACE, role: 'member', boxScope: 'all' }
const assignedMember: Actor = { ...member, boxScope: 'assigned' }
const admin: Actor = { ...member, role: 'admin' }

function team(overrides: Row = {}): Row {
    return { id: 'team-1', workspace_id: WORKSPACE, name: 'Growth', description: null, color: '#2563eb', created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', ...overrides }
}

function teamMember(overrides: Row = {}): Row {
    return { id: 'tm-1', team_id: 'team-1', workspace_id: WORKSPACE, user_id: 'me', agent_id: null, role: 'member', created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', ...overrides }
}

function setup(tables: Partial<Tables> = {}, refuse?: Record<string, { code?: string; message: string }>) {
    const rows: Tables = {
        teams: [],
        team_members: [],
        projects: [],
        project_members: [],
        activity_events: [],
        workspace_members: [{ user_id: 'me', workspace_id: WORKSPACE }],
        agents: [{ id: 'agent-1', workspace_id: WORKSPACE, space_id: 'box-open' }],
        spaces: [{ id: 'box-open', workspace_id: WORKSPACE, visibility: 'workspace' }],
        space_members: [],
        ...tables,
    }
    const db = workDatabase(rows, { refuse })
    return { db, rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
}

beforeEach(() => vi.clearAllMocks())

describe('createTeam and updateTeam', () => {
    it('creates a team and logs it', async () => {
        const { rows, scope } = setup()
        const created = await createTeam(scope, ME, { name: '  Growth ', color: '#2563eb' })
        expect(created).toMatchObject({ name: 'Growth', color: '#2563eb', members: [] })
        expect(rows.activity_events[0]).toMatchObject({ action: 'team.created', entity_type: 'team', entity_id: created.id })
    })

    it('names the refusal when another team holds the name', async () => {
        const { scope } = setup({}, { teams: { code: '23505', message: 'duplicate key' } })
        await expect(createTeam(scope, ME, { name: 'Growth' })).rejects.toMatchObject({ code: 'teamNameTaken', params: { name: 'Growth' } })
    })

    it('refuses an invalid colour and an empty name before writing', async () => {
        const { db, scope } = setup()
        await expect(createTeam(scope, ME, { name: ' ' })).rejects.toMatchObject({ code: 'nameRequired' })
        await expect(createTeam(scope, ME, { name: 'Ops', color: 'blue' })).rejects.toMatchObject({ code: 'invalidInput' })
        expect(db.writes('teams')).toHaveLength(0)
    })

    it('writes only what changed', async () => {
        const { db, rows, scope } = setup({ teams: [team()] })
        await updateTeam(scope, ME, 'team-1', { description: 'Pipeline and SEO' })
        expect(db.writes('teams')[0].payload).toEqual({ description: 'Pipeline and SEO' })
        expect(rows.activity_events[0]).toMatchObject({ action: 'team.updated', metadata: { fields: ['description'] } })
    })

    it('reads a team of another workspace as missing', async () => {
        const { scope } = setup({ teams: [team({ workspace_id: 99 })] })
        await expect(updateTeam(scope, ME, 'team-1', { name: 'x' })).rejects.toMatchObject({ code: 'teamNotFound' })
        await expect(deleteTeam(scope, ME, 'team-1')).rejects.toMatchObject({ code: 'teamNotFound' })
    })

    it('deletes a team and logs it', async () => {
        const { rows, scope } = setup({ teams: [team()] })
        await deleteTeam(scope, ME, 'team-1')
        expect(rows.teams).toEqual([])
        expect(rows.activity_events[0]).toMatchObject({ action: 'team.deleted', metadata: { name: 'Growth' } })
    })
})

describe('team members', () => {
    it('adds a person and a coworker, and refuses a stranger', async () => {
        const { rows, scope } = setup({ teams: [team()] })

        await addTeamMember(scope, ME, 'team-1', { member: { kind: 'user', userId: 'me' } })
        const withCoworker = await addTeamMember(scope, ME, 'team-1', { member: { kind: 'agent', agentId: 'agent-1' } })
        await expect(addTeamMember(scope, ME, 'team-1', { member: { kind: 'agent', agentId: 'agent-x' } })).rejects.toMatchObject({ code: 'assigneeNotInWorkspace' })

        expect(withCoworker.members.map(entry => entry.member)).toEqual([
            { kind: 'user', userId: 'me' },
            { kind: 'agent', agentId: 'agent-1' },
        ])
        expect(rows.activity_events.map(event => [event.action, event.metadata])).toEqual([
            ['team.member_added', { userId: 'me', agentId: null, role: 'member' }],
            ['team.member_added', { userId: null, agentId: 'agent-1', role: 'member' }],
        ])
    })

    it('names a member added twice', async () => {
        const { scope } = setup({ teams: [team()] }, { team_members: { code: '23505', message: 'duplicate key' } })
        await expect(addTeamMember(scope, ME, 'team-1', { member: { kind: 'user', userId: 'me' } })).rejects.toMatchObject({ code: 'teamMemberAlreadyIn' })
    })

    it('keeps one lead: naming one hands the other back to member', async () => {
        const { rows, scope } = setup({ teams: [team()], team_members: [teamMember({ role: 'lead' }), teamMember({ id: 'tm-2', user_id: null, agent_id: 'agent-1' })] })

        const updated = await setTeamMemberRole(scope, ME, 'team-1', 'tm-2', 'lead')

        expect(updated.members.map(entry => [entry.id, entry.role])).toEqual([
            ['tm-1', 'member'],
            ['tm-2', 'lead'],
        ])
        expect(rows.activity_events[0]).toMatchObject({ action: 'team.member_role_changed', metadata: { userId: null, agentId: 'agent-1', from: 'member', to: 'lead' } })
    })

    it('removes a member and logs who left', async () => {
        const { rows, scope } = setup({ teams: [team()], team_members: [teamMember()] })
        const updated = await removeTeamMember(scope, ME, 'team-1', 'tm-1')
        expect(updated.members).toEqual([])
        expect(rows.activity_events[0]).toMatchObject({ action: 'team.member_removed', metadata: { userId: 'me', agentId: null } })
        await expect(removeTeamMember(scope, ME, 'team-1', 'tm-1')).rejects.toMatchObject({ code: 'teamMemberNotFound' })
    })

    it('knows who leads a team', async () => {
        const { scope } = setup({ teams: [team()], team_members: [teamMember({ role: 'lead' })] })
        await expect(isTeamLead(scope, 'team-1', 'me')).resolves.toBe(true)
        await expect(isTeamLead(scope, 'team-1', 'teammate')).resolves.toBe(false)
    })
})

describe('listTeamOverviews and teamNamesByAgent', () => {
    it('lists each team with its members and the projects the actor sees', async () => {
        const { scope } = setup({
            teams: [team(), team({ id: 'team-2', name: 'Ops' })],
            team_members: [teamMember({ team_id: 'team-2', user_id: null, agent_id: 'agent-1', role: 'lead' })],
            projects: [
                { id: 'p-1', workspace_id: WORKSPACE, key: 'WEB', name: 'Website', status: 'active', team_id: 'team-1', visibility: 'workspace', archived_at: null },
                { id: 'p-2', workspace_id: WORKSPACE, key: 'HR', name: 'Hiring', status: 'active', team_id: 'team-1', visibility: 'restricted', archived_at: null },
            ],
        })

        const overviews = await listTeamOverviews(scope, member)

        expect(overviews.map(overview => [overview.name, overview.projects.map(project => project.key), overview.members.map(entry => entry.role)])).toEqual([
            ['Growth', ['WEB'], []],
            ['Ops', [], ['lead']],
        ])
    })

    describe('coworkers the reader cannot see', () => {
        // agent-1 in an open Box, agent-2 in a restricted one, agent-3 in an open Box nobody granted.
        const tables = () => ({
            spaces: [
                { id: 'box-open', workspace_id: WORKSPACE, visibility: 'workspace' },
                { id: 'box-shut', workspace_id: WORKSPACE, visibility: 'restricted' },
            ],
            agents: [
                { id: 'agent-1', workspace_id: WORKSPACE, space_id: 'box-open' },
                { id: 'agent-2', workspace_id: WORKSPACE, space_id: 'box-shut' },
            ],
            teams: [team()],
            team_members: [teamMember(), teamMember({ id: 'tm-2', user_id: null, agent_id: 'agent-1', role: 'lead' }), teamMember({ id: 'tm-3', user_id: null, agent_id: 'agent-2' })],
        })
        const shown = (overviews: Awaited<ReturnType<typeof listTeamOverviews>>) => overviews[0].members.map(entry => (entry.member.kind === 'user' ? entry.member.userId : entry.member.agentId))

        it('leaves out the coworker of a restricted Box for a member scoped to all Boxes', async () => {
            const { scope } = setup(tables())
            expect(shown(await listTeamOverviews(scope, member))).toEqual(['me', 'agent-1'])
        })

        it('keeps the team and its people for a member scoped to assigned Boxes who sees no coworker', async () => {
            const { scope } = setup(tables())
            const [overview] = await listTeamOverviews(scope, assignedMember)
            expect(overview.name).toBe('Growth')
            expect(shown([overview])).toEqual(['me'])
        })

        it('shows every coworker to an admin, and what a grant opens to a member', async () => {
            const { scope } = setup(tables())
            expect(shown(await listTeamOverviews(scope, admin))).toEqual(['me', 'agent-1', 'agent-2'])
            const granted = setup({ ...tables(), space_members: [{ space_id: 'box-shut', user_id: 'me', workspace_id: WORKSPACE, access: 'use' }] })
            expect(shown(await listTeamOverviews(granted.scope, assignedMember))).toEqual(['me', 'agent-2'])
        })

        it('filters a team handed back by a change the same way', () => {
            const result = visibleTeam({ id: 't', name: 'x', description: null, color: null, createdAt: '', updatedAt: '', members: [{ id: 'a', member: { kind: 'agent', agentId: 'hidden' }, role: 'lead' }] }, new Set<string>())
            expect(result.members).toEqual([])
        })
    })

    it('names the teams of each coworker', async () => {
        const { scope } = setup({ teams: [team(), team({ id: 'team-2', name: 'Ops' })], team_members: [teamMember({ team_id: 'team-2', user_id: null, agent_id: 'agent-1' }), teamMember({ id: 'tm-2', user_id: null, agent_id: 'agent-1' })] })
        expect(Object.fromEntries(await teamNamesByAgent(scope))).toEqual({ 'agent-1': ['Growth', 'Ops'] })
    })
})
