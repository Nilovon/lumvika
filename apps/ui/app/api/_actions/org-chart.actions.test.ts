import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn() }))

vi.mock('@/lib/auth/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))

const { readOrgChartAction, setCoworkerReportingAction } = await import('./org-chart.actions')

const WORKSPACE = 7
const ME = 'user-me'

function agent(id: string, overrides: Row = {}): Row {
    return { id, workspace_id: WORKSPACE, name: id, handle: id, title: null, reports_to_agent_id: null, space_id: 'box-1', engine_agent_id: null, disabled_at: null, created_at: `then-${id}`, ...overrides }
}

function signedInAs(role: 'admin' | 'member', tables: Partial<Tables> = {}) {
    mocks.getServerSession.mockResolvedValue({ user: { id: ME, workspace_id: WORKSPACE }, workspace: { id: WORKSPACE, name: 'Acme' }, session: { id: ME, email: 'me@acme.test' }, workspaceRefused: false })
    const rows: Tables = {
        workspace_members: [{ user_id: ME, workspace_id: WORKSPACE, role, box_scope: 'all' }],
        spaces: [
            { id: 'box-1', workspace_id: WORKSPACE, name: 'Studio', visibility: 'workspace' },
            { id: 'box-shut', workspace_id: WORKSPACE, name: 'Board room', visibility: 'restricted' },
        ],
        space_members: [],
        agents: [agent('ceo'), agent('cto', { reports_to_agent_id: 'ceo' })],
        activity_events: [],
        ...tables,
    }
    const db = workDatabase(rows)
    return { db, rows }
}

beforeEach(() => vi.clearAllMocks())

describe('org chart actions', () => {
    it('lets any member read the org chart', async () => {
        signedInAs('member')
        const result = await readOrgChartAction()
        expect(result).toMatchObject({ ok: true, coworkers: [{ id: 'ceo', reportsToAgentId: null, spaceName: 'Studio' }, { id: 'cto', reportsToAgentId: 'ceo' }] })
    })

    it('needs the right to manage the coworker to change its title or manager', async () => {
        const { db } = signedInAs('member')
        await expect(setCoworkerReportingAction('cto', { title: 'CTO' })).resolves.toMatchObject({ ok: false, code: 'boxManagerOnly' })
        expect(db.writes('agents')).toHaveLength(0)
    })

    it('changes them for someone who manages its Box', async () => {
        const { rows } = signedInAs('member', { space_members: [{ space_id: 'box-1', user_id: ME, access: 'manage' }] })
        await expect(setCoworkerReportingAction('cto', { title: 'CTO', reportsToAgentId: null })).resolves.toEqual({ ok: true })
        expect(rows.agents.find(row => row.id === 'cto')).toMatchObject({ title: 'CTO', reports_to_agent_id: null })
        expect(rows.activity_events[0]).toMatchObject({ action: 'agent.reporting_changed', actor_user_id: ME })
    })

    it('hands back a refused loop with its own code', async () => {
        signedInAs('admin')
        await expect(setCoworkerReportingAction('ceo', { reportsToAgentId: 'cto' })).resolves.toMatchObject({ ok: false, code: 'coworkerReportingCycle', error: expect.stringContaining('loop') })
    })

    it('keeps the coworkers of a restricted Box out of the chart, their reports drawn as roots', async () => {
        signedInAs('member', { agents: [agent('boss', { space_id: 'box-shut' }), agent('cto', { reports_to_agent_id: 'boss' })] })
        const result = await readOrgChartAction()
        expect(result).toMatchObject({ ok: true, coworkers: [{ id: 'cto', reportsToAgentId: null }] })
        expect(JSON.stringify(result)).not.toContain('boss')
    })

    it('shows a member scoped to assigned Boxes only the Boxes granted to them', async () => {
        signedInAs('member', { workspace_members: [{ user_id: ME, workspace_id: WORKSPACE, role: 'member', box_scope: 'assigned' }] })
        await expect(readOrgChartAction()).resolves.toEqual({ ok: true, coworkers: [] })
    })

    it('refuses a manager the caller cannot see as a coworker that does not exist', async () => {
        const { db } = signedInAs('member', { agents: [agent('boss', { space_id: 'box-shut' }), agent('cto')], space_members: [{ space_id: 'box-1', user_id: ME, access: 'manage' }] })
        await expect(setCoworkerReportingAction('cto', { reportsToAgentId: 'boss' })).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
        expect(db.writes('agents')).toHaveLength(0)
    })

    it('lets an admin pick a manager in a restricted Box', async () => {
        const { rows } = signedInAs('admin', { agents: [agent('boss', { space_id: 'box-shut' }), agent('cto')] })
        await expect(setCoworkerReportingAction('cto', { reportsToAgentId: 'boss' })).resolves.toEqual({ ok: true })
        expect(rows.agents.find(row => row.id === 'cto')).toMatchObject({ reports_to_agent_id: 'boss' })
    })

    it('reads a coworker of another workspace as missing', async () => {
        signedInAs('admin', { agents: [agent('far', { workspace_id: 99 })] })
        await expect(setCoworkerReportingAction('far', { title: 'x' })).resolves.toMatchObject({ ok: false, code: 'coworkerNotFound' })
    })
})
