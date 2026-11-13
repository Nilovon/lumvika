import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row } from '@/test/work-fake'

vi.mock('@/supabase/serviceRole', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/lib/board/live-sessions', () => ({ fetchLiveSessions: vi.fn(async () => []) }))
vi.mock('@/app/api/_services/workspace-engine.service', () => ({ findWorkspaceEngine: vi.fn(async () => null) }))

const { createServiceRoleClient } = await import('@/supabase/serviceRole')
const { readTeamStatus } = await import('./team-status.service')

const WORKSPACE = 7

function agent(id: string, overrides: Row = {}): Row {
    return { id, workspace_id: WORKSPACE, name: id.toUpperCase(), handle: id, title: null, reports_to_agent_id: null, space_id: 'box-1', engine_agent_id: null, disabled_at: null, created_at: `2026-11-01T00:00:0${id.length}.000Z`, ...overrides }
}

beforeEach(() => {
    vi.clearAllMocks()
    const db = workDatabase({
        agents: [agent('lead', { title: 'Head of growth', space_id: 'box-2' }), agent('writer', { reports_to_agent_id: 'lead' }), agent('seo', { reports_to_agent_id: 'lead', handle: null, name: 'Seo Scout' })],
        workspaces: [{ id: WORKSPACE, boxes_disabled_at: null, boxes_archived_at: null }],
        teams: [{ id: 'team-1', workspace_id: WORKSPACE, name: 'Growth' }],
        team_members: [{ team_id: 'team-1', workspace_id: WORKSPACE, agent_id: 'writer', user_id: null }],
    })
    vi.mocked(createServiceRoleClient).mockReturnValue(db.client)
})

describe('readTeamStatus', () => {
    it('tells each coworker its title, its manager, its reports and its teams, by handle', async () => {
        const { agents } = await readTeamStatus(WORKSPACE)
        const places = Object.fromEntries(agents.map(entry => [entry.id, { title: entry.title, reportsTo: entry.reportsTo, directReports: entry.directReports, teams: entry.teams }]))
        expect(places).toEqual({
            lead: { title: 'Head of growth', reportsTo: null, directReports: ['Seo Scout', 'writer'], teams: [] },
            writer: { title: null, reportsTo: 'lead', directReports: [], teams: ['Growth'] },
            seo: { title: null, reportsTo: 'lead', directReports: [], teams: [] },
        })
    })

    it('never names a coworker the caller cannot see', async () => {
        const { agents } = await readTeamStatus(WORKSPACE, {}, new Set(['writer', 'seo']))
        expect(agents.map(entry => [entry.id, entry.reportsTo, entry.directReports])).toEqual([
            ['seo', null, []],
            ['writer', null, []],
        ])
    })

    it('names a manager that sits in a Box the filter left out', async () => {
        const { agents } = await readTeamStatus(WORKSPACE, { spaceId: 'box-1' })
        expect(agents.map(entry => [entry.id, entry.reportsTo])).toEqual([
            ['seo', 'lead'],
            ['writer', 'lead'],
        ])
        expect(agents[1]).toMatchObject({ handle: 'writer', status: expect.any(String), running: [], waitingOn: [] })
    })
})
