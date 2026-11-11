import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DbCall } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn(), startAgentSetup: vi.fn() }))

vi.mock('@/lib/auth/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
vi.mock('@/lib/steward/setup-handoff', () => ({ startAgentSetup: mocks.startAgentSetup }))
vi.mock('@/lib/steward/build-team', () => ({ PLAIN_KICKOFF: 'kickoff' }))

const { readLeadInstallAction, startLeadSetupAction } = await import('./steward-lead.actions')

const WORKSPACE_ID = 7
const ADMIN = { user_id: 'user-1', role: 'admin', box_scope: 'all' }
let MEMBERSHIP: { user_id: string; role: string; box_scope: string } = ADMIN
let SPACE_VISIBILITY = 'workspace'

const filtersOf = (call: DbCall) => call.args[1] as Record<string, unknown>

function database(agentWorkspaceId: number, conversations = [{ id: 'conversation-1' }]) {
    db.answer(call => {
        if (call.table === 'workspace_members') return { data: MEMBERSHIP }
        if (call.table === 'agents') return { data: { workspace_id: agentWorkspaceId, space_id: 'space-1', engine_agent_id: 'engine-1' } }
        if (call.table === 'spaces') return { data: { id: 'space-1', workspace_id: agentWorkspaceId, visibility: SPACE_VISIBILITY } }
        if (call.table === 'space_members') return { data: null }
        if (call.table === 'sessions') return { data: filtersOf(call).agent_id === 'agent-1' ? conversations : [] }
        return undefined
    })
}

const sessionReads = () => db.calls.filter(call => call.table === 'sessions')

beforeEach(() => {
    vi.clearAllMocks()
    db.reset()
    MEMBERSHIP = ADMIN
    SPACE_VISIBILITY = 'workspace'
    mocks.getServerSession.mockResolvedValue({
        user: { id: 'user-1', workspace_id: WORKSPACE_ID },
        workspace: { id: WORKSPACE_ID, name: 'Acme' },
        session: { id: 'user-1', email: 'me@acme.test' },
        workspaceRefused: false,
    })
})

describe('readLeadInstallAction', () => {
    it('names the conversation of a lead that already started', async () => {
        database(WORKSPACE_ID)

        await expect(readLeadInstallAction('agent-1')).resolves.toEqual({ conversationId: 'conversation-1' })
    })

    it('reads a lead without a conversation as not started', async () => {
        database(WORKSPACE_ID, [])

        await expect(readLeadInstallAction('agent-1')).resolves.toEqual({ conversationId: null })
    })

    it('reads an agent from another workspace as not started, without reading its conversations', async () => {
        database(99)

        await expect(readLeadInstallAction('agent-1')).resolves.toEqual({ conversationId: null })
        expect(sessionReads()).toHaveLength(0)
    })
})

describe('startLeadSetupAction', () => {
    it('reopens the conversation the lead already started instead of a second install', async () => {
        database(WORKSPACE_ID)

        await expect(startLeadSetupAction('agent-1')).resolves.toEqual({ ok: true, conversationId: 'conversation-1', runId: null })
        expect(mocks.startAgentSetup).not.toHaveBeenCalled()
    })

    it('refuses an agent from another workspace without reading its conversations', async () => {
        database(99)

        const result = await startLeadSetupAction('agent-1')

        expect(result.ok).toBe(false)
        expect(result).not.toHaveProperty('conversationId')
        expect(sessionReads()).toHaveLength(0)
        expect(mocks.startAgentSetup).not.toHaveBeenCalled()
    })

    it('starts the install when the lead has no conversation yet', async () => {
        database(WORKSPACE_ID, [])
        mocks.startAgentSetup.mockResolvedValue({ agents: [{ agentId: 'agent-1', started: true, conversationId: 'conversation-2', runId: 'run-1' }] })

        await expect(startLeadSetupAction('agent-1')).resolves.toEqual({ ok: true, conversationId: 'conversation-2', runId: 'run-1' })
        expect(mocks.startAgentSetup.mock.calls[0][1]).toEqual({ agents: [{ agentId: 'agent-1', message: 'kickoff' }] })
    })

    it('refuses a member whose Box is closed to them, without reading its conversations', async () => {
        MEMBERSHIP = { user_id: 'user-1', role: 'member', box_scope: 'all' }
        SPACE_VISIBILITY = 'restricted'
        database(WORKSPACE_ID)

        await expect(startLeadSetupAction('agent-1')).resolves.toEqual({ ok: false, error: 'Coworker not found', code: 'coworkerNotFound' })
        expect(sessionReads()).toHaveLength(0)
        expect(mocks.startAgentSetup).not.toHaveBeenCalled()
    })

    it('lets a member start a lead in a Box open to the workspace', async () => {
        MEMBERSHIP = { user_id: 'user-1', role: 'member', box_scope: 'all' }
        database(WORKSPACE_ID)

        await expect(startLeadSetupAction('agent-1')).resolves.toEqual({ ok: true, conversationId: 'conversation-1', runId: null })
    })

    it('reports an agent without a free slot as inactive', async () => {
        database(WORKSPACE_ID, [])
        mocks.startAgentSetup.mockResolvedValue({ agents: [{ agentId: 'agent-1', started: false, inactive: true }] })

        await expect(startLeadSetupAction('agent-1')).resolves.toMatchObject({ ok: false, inactive: true })
    })
})
