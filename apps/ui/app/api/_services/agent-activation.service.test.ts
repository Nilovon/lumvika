import { beforeEach, describe, expect, it, vi } from 'vitest'

import { patchAgent } from '@/lib/engine/client'
import type { DbCall } from '@/test/db-fake'
import { activateAgent, NO_FREE_SLOT_ERROR, reactivateAgentsAfterRestore, reconcileAgentActivation, stopAgentsOnEngine, wakePlanLimitedAgents } from './agent-activation.service'
import { pauseAgentSchedules, resumeAgentSchedules } from './agent.service'
import { getSpaceConnection } from './space.service'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@lumvika/cloud/billing', async importOriginal => ({ ...(await importOriginal<object>()), ...(await import('@/test/cloud-fakes')).CLOUD_ENTITLEMENTS }))

vi.mock('@/lib/engine/client', () => ({ patchAgent: vi.fn() }))
vi.mock('./agent.service', () => ({ pauseAgentSchedules: vi.fn(), resumeAgentSchedules: vi.fn() }))
vi.mock('./space.service', () => ({ getSpaceConnection: vi.fn() }))

type Agent = { id: string; workspace_id: number; disabled_at: string | null; disabled_reason: string | null; engine_agent_id: string | null; space_id: string }

let workspace: { max_agents: number | null; subscription_status: string | null }
let agents: Agent[]

const filtersOf = (call: DbCall) => call.args[1] as Record<string, unknown>
const agentReads = () => db.calls.filter(call => call.table === 'agents' && call.helper.startsWith('select'))
const agentUpdates = () => db.callsTo('updateRows', 'agents').map(call => ({ payload: call.args[0], filters: call.args[1] }))

function agent(id: string, overrides: Partial<Agent> = {}): Agent {
    return { id, workspace_id: 1, disabled_at: null, disabled_reason: null, engine_agent_id: `eng_${id}`, space_id: 'space_1', ...overrides }
}

function answerAgents(call: DbCall) {
    if (call.table === 'workspaces') return { data: workspace }
    if (call.table !== 'agents') return undefined
    const active = agents.filter(row => !row.disabled_at)
    if (call.helper === 'selectCount') return { data: active.length }
    if (!call.helper.startsWith('select')) return undefined
    const filters = filtersOf(call)
    if (typeof filters.id === 'string') return { data: agents.find(row => row.id === filters.id) ?? null }
    if (filters.disabled_reason !== undefined) return { data: agents.filter(row => row.disabled_reason === filters.disabled_reason) }
    return { data: active }
}

beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    workspace = { max_agents: 2, subscription_status: 'active' }
    agents = []
    db.reset()
    db.answer(answerAgents)
    vi.mocked(getSpaceConnection).mockResolvedValue({ url: 'http://box' } as never)
})

describe('reconcileAgentActivation', () => {
    it('switches off the newest agents above the limit', async () => {
        agents = [agent('a1'), agent('a2'), agent('a3'), agent('a4')]

        await expect(reconcileAgentActivation(1)).resolves.toEqual(['a3', 'a4'])

        const read = db.callsTo('selectAll', 'agents')[0]
        expect(read.args[2]).toEqual({ column: 'created_at', ascending: true })
        const [update] = agentUpdates()
        expect(update.payload).toEqual({ disabled_at: expect.any(String), disabled_reason: 'plan_limit' })
        expect(update.filters).toEqual({ id: ['a3', 'a4'] })
    })

    it('switches off every agent when the plan is gone', async () => {
        workspace = { max_agents: 2, subscription_status: 'canceled' }
        agents = [agent('a1'), agent('a2')]

        await expect(reconcileAgentActivation(1)).resolves.toEqual(['a1', 'a2'])
    })

    it('writes nothing when the workspace is within its limit', async () => {
        agents = [agent('a1'), agent('a2')]
        await expect(reconcileAgentActivation(1)).resolves.toEqual([])
        expect(agentUpdates()).toEqual([])
    })

    it('reads nothing for an unlimited workspace', async () => {
        workspace = { max_agents: null, subscription_status: 'active' }
        await expect(reconcileAgentActivation(1)).resolves.toEqual([])
        expect(agentReads()).toHaveLength(0)
    })
})

describe('activateAgent', () => {
    it('throws for an unknown agent', async () => {
        await expect(activateAgent('ghost')).rejects.toThrow('Coworker not found')
    })

    it('does nothing for an agent that is already active', async () => {
        agents = [agent('a1')]
        await activateAgent('a1')
        expect(agentUpdates()).toEqual([])
        expect(patchAgent).not.toHaveBeenCalled()
    })

    it('refuses an agent switched off by a template revocation', async () => {
        agents = [agent('a1', { disabled_at: '2026-09-01T00:00:00Z', disabled_reason: 'template_revoked:tpl_1' })]
        await expect(activateAgent('a1')).rejects.toThrow('This coworker came from a template subscription that has ended.')
        expect(agentUpdates()).toEqual([])
    })

    it('refuses when no slot is free', async () => {
        agents = [agent('a1'), agent('a2'), agent('a3', { disabled_at: '2026-09-01T00:00:00Z', disabled_reason: 'plan_limit' })]
        await expect(activateAgent('a3')).rejects.toThrow(NO_FREE_SLOT_ERROR)
        expect(agentUpdates()).toEqual([])
    })

    it('switches the agent back on and reaches its engine', async () => {
        agents = [agent('a1'), agent('a3', { disabled_at: '2026-09-01T00:00:00Z', disabled_reason: 'plan_limit' })]

        await activateAgent('a3')

        const [update] = agentUpdates()
        expect(update.payload).toEqual({ disabled_at: null, disabled_reason: null })
        expect(update.filters).toEqual({ id: 'a3' })
        expect(patchAgent).toHaveBeenCalledWith({ url: 'http://box' }, 'eng_a3', { enabled: true })
        expect(resumeAgentSchedules).toHaveBeenCalledWith('a3')
    })

    it('still counts as activated when the engine cannot be reached', async () => {
        agents = [agent('a3', { disabled_at: '2026-09-01T00:00:00Z', disabled_reason: null })]
        vi.mocked(patchAgent).mockRejectedValue(new Error('box asleep'))
        vi.mocked(resumeAgentSchedules).mockRejectedValue(new Error('box asleep'))

        await expect(activateAgent('a3')).resolves.toBeUndefined()
        expect(agentUpdates()).toHaveLength(1)
    })
})

describe('stopAgentsOnEngine', () => {
    it('keeps going through the batch when one agent cannot be reached', async () => {
        agents = [agent('a1'), agent('a2')]
        vi.mocked(pauseAgentSchedules).mockImplementation(async id => {
            if (id === 'a1') throw new Error('box asleep')
        })
        vi.mocked(patchAgent).mockImplementation(async (_conn, engineAgentId) => {
            if (engineAgentId === 'eng_a1') throw new Error('box asleep')
            return undefined as never
        })

        await expect(stopAgentsOnEngine(['a1', 'a2'])).resolves.toBeUndefined()

        expect(pauseAgentSchedules).toHaveBeenCalledWith('a2')
        expect(patchAgent).toHaveBeenCalledWith({ url: 'http://box' }, 'eng_a1', { enabled: false })
        expect(patchAgent).toHaveBeenCalledWith({ url: 'http://box' }, 'eng_a2', { enabled: false })
    })

    it('skips the engine flag of an agent that never reached its engine', async () => {
        agents = [agent('a1', { engine_agent_id: null })]
        await stopAgentsOnEngine(['a1'])
        expect(pauseAgentSchedules).toHaveBeenCalledWith('a1')
        expect(patchAgent).not.toHaveBeenCalled()
    })
})

describe('wakePlanLimitedAgents and reactivateAgentsAfterRestore', () => {
    it('wakes the oldest switched-off agents the plan has room for, on the engine too', async () => {
        workspace = { max_agents: 2, subscription_status: 'active' }
        agents = [agent('a1', { disabled_at: 'x', disabled_reason: 'plan_limit' }), agent('a2', { disabled_at: 'x', disabled_reason: 'plan_limit' }), agent('a3', { disabled_at: 'x', disabled_reason: 'plan_limit' })]

        await expect(reactivateAgentsAfterRestore(1)).resolves.toEqual(['a1', 'a2'])

        const [update] = agentUpdates()
        expect(update.payload).toEqual({ disabled_at: null, disabled_reason: null })
        expect(update.filters).toEqual({ id: ['a1', 'a2'] })
        expect(patchAgent).toHaveBeenCalledWith(expect.anything(), 'eng_a1', { enabled: true })
        expect(patchAgent).toHaveBeenCalledWith(expect.anything(), 'eng_a2', { enabled: true })
        expect(resumeAgentSchedules).toHaveBeenCalledWith('a1')
    })

    it('leaves a template-revoked agent off', async () => {
        agents = [agent('a1', { disabled_at: 'x', disabled_reason: 'template_revoked' })]

        await expect(reactivateAgentsAfterRestore(1)).resolves.toEqual([])
        expect(agentUpdates()).toEqual([])
    })

    it('wakes every capped agent of an unlimited plan without reaching the engine itself', async () => {
        workspace = { max_agents: null, subscription_status: 'active' }
        agents = [agent('a1'), agent('a4', { disabled_at: 'x', disabled_reason: 'plan_limit' }), agent('a5', { disabled_at: 'x', disabled_reason: 'plan_limit' })]

        await expect(wakePlanLimitedAgents(1)).resolves.toEqual({ woken: ['a4', 'a5'], active: ['a1'] })
        expect(agentUpdates()[0].payload).toEqual({ disabled_at: null, disabled_reason: null })
        expect(patchAgent).not.toHaveBeenCalled()
    })

    it('switches the agents still marked active back on on the engine', async () => {
        agents = [agent('a1')]

        await reactivateAgentsAfterRestore(1)

        expect(patchAgent).toHaveBeenCalledWith(expect.anything(), 'eng_a1', { enabled: true })
    })
})
