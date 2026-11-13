import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workDatabase, type Row, type Tables } from '@/test/work-fake'

vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/work-fake')).workDbHelpers }))

const { readOrgChart, reportingRefusalOf, setCoworkerReporting } = await import('./org-chart.service')

const WORKSPACE = 7
const ME = { kind: 'user', userId: 'me' } as const

function agent(id: string, overrides: Row = {}): Row {
    return { id, workspace_id: WORKSPACE, name: id.toUpperCase(), handle: id, title: null, reports_to_agent_id: null, space_id: 'box-1', disabled_at: null, created_at: `2026-11-01T00:00:0${id.length}.000Z`, ...overrides }
}

// ceo ← cto ← dev
function setup(tables: Partial<Tables> = {}) {
    const rows: Tables = { agents: [agent('ceo'), agent('cto', { reports_to_agent_id: 'ceo' }), agent('dev', { reports_to_agent_id: 'cto' })], spaces: [{ id: 'box-1', workspace_id: WORKSPACE, name: 'Studio' }], activity_events: [], ...tables }
    const db = workDatabase(rows)
    return { db, rows, scope: { workspaceId: WORKSPACE, db: db.scope } }
}

beforeEach(() => vi.clearAllMocks())

describe('readOrgChart', () => {
    it('reads every coworker of the workspace with its title, manager and Box', async () => {
        const { scope } = setup({ agents: [agent('ceo', { title: 'Chief of staff' }), agent('dev', { reports_to_agent_id: 'ceo', disabled_at: 'then' }), agent('other', { workspace_id: 99 })] })
        await expect(readOrgChart(scope, 'all')).resolves.toEqual([
            { id: 'ceo', name: 'CEO', handle: 'ceo', title: 'Chief of staff', reportsToAgentId: null, spaceId: 'box-1', spaceName: 'Studio', disabled: false },
            { id: 'dev', name: 'DEV', handle: 'dev', title: null, reportsToAgentId: 'ceo', spaceId: 'box-1', spaceName: 'Studio', disabled: true },
        ])
    })
})

describe('readOrgChart for a reader who cannot see every coworker', () => {
    it('draws a coworker whose manager is hidden as a root and leaves a hidden report out', async () => {
        const { scope } = setup()
        const chart = await readOrgChart(scope, new Set(['cto']))
        expect(chart).toEqual([expect.objectContaining({ id: 'cto', reportsToAgentId: null })])
        expect(JSON.stringify(chart)).not.toContain('ceo')
    })
})

describe('setCoworkerReporting', () => {
    it('sets the title and the manager and logs both changes', async () => {
        const { db, rows, scope } = setup()
        await setCoworkerReporting(scope, ME, 'dev', { title: ' Engineer ', reportsToAgentId: 'ceo' })
        expect(db.writes('agents')[0].payload).toEqual({ title: 'Engineer', reports_to_agent_id: 'ceo' })
        expect(rows.activity_events[0]).toMatchObject({ action: 'agent.reporting_changed', entity_type: 'agent', entity_id: 'dev', metadata: { title: { from: null, to: 'Engineer' }, reportsTo: { from: 'cto', to: 'ceo' } } })
    })

    it('clears the manager and an emptied title', async () => {
        const { db, scope } = setup({ agents: [agent('dev', { title: 'Engineer', reports_to_agent_id: 'ceo' }), agent('ceo')] })
        await setCoworkerReporting(scope, ME, 'dev', { title: '', reportsToAgentId: null })
        expect(db.writes('agents')[0].payload).toEqual({ title: null, reports_to_agent_id: null })
    })

    it('refuses itself, a coworker of another workspace and a loop before writing', async () => {
        const { db, rows, scope } = setup({ agents: [agent('ceo'), agent('cto', { reports_to_agent_id: 'ceo' }), agent('dev', { reports_to_agent_id: 'cto' }), agent('far', { workspace_id: 99 })] })
        await expect(setCoworkerReporting(scope, ME, 'cto', { reportsToAgentId: 'cto' })).rejects.toMatchObject({ code: 'coworkerReportsToSelf' })
        await expect(setCoworkerReporting(scope, ME, 'cto', { reportsToAgentId: 'far' })).rejects.toMatchObject({ code: 'coworkerReportsToOtherWorkspace' })
        await expect(setCoworkerReporting(scope, ME, 'ceo', { reportsToAgentId: 'dev' })).rejects.toMatchObject({ code: 'coworkerReportingCycle' })
        await expect(setCoworkerReporting(scope, ME, 'far', { reportsToAgentId: 'ceo' })).rejects.toMatchObject({ code: 'coworkerNotFound' })
        expect(db.writes('agents')).toHaveLength(0)
        expect(rows.activity_events).toHaveLength(0)
    })

    it('writes nothing when nothing changes', async () => {
        const { db, scope } = setup()
        await setCoworkerReporting(scope, ME, 'dev', { reportsToAgentId: 'cto', title: null })
        expect(db.writes('agents')).toHaveLength(0)
    })

    it('translates the refusal of the database trigger, which holds the line against a race', async () => {
        const { db, scope } = setup({ agents: [agent('ceo'), agent('dev')] })
        db.helpers.updateRows = async () => ({ data: null, error: { code: '23514', message: 'agents_reports_to_cycle: this reporting line would loop back to the agent' } })
        await expect(setCoworkerReporting(scope, ME, 'ceo', { reportsToAgentId: 'dev' })).rejects.toMatchObject({ code: 'coworkerReportingCycle' })
    })
})

describe('reportingRefusalOf', () => {
    it('maps each trigger message to its code and leaves anything else alone', () => {
        expect(reportingRefusalOf({ message: 'agents_reports_to_self: an agent cannot report to itself' })).toBe('coworkerReportsToSelf')
        expect(reportingRefusalOf({ message: 'agents_reports_to_other_workspace: the manager belongs to another workspace' })).toBe('coworkerReportsToOtherWorkspace')
        expect(reportingRefusalOf({ message: 'agents_reports_to_cycle: this reporting line would loop back to the agent' })).toBe('coworkerReportingCycle')
        expect(reportingRefusalOf({ message: 'connection reset' })).toBeNull()
        expect(reportingRefusalOf(null)).toBeNull()
    })
})
