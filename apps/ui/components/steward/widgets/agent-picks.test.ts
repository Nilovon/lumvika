import { describe, expect, it } from 'vitest'

import { planAgentShortcuts, readAgentPicks } from './agent-picks'

describe('readAgentPicks', () => {
    it('reads a row with the tab and the conversation it leads to', () => {
        expect(readAgentPicks({ agents: [{ agentId: 'a1', tab: 'chat', conversationId: 'c1', runId: 'r1' }] })).toEqual([{ agentId: 'a1', tab: 'chat', conversationId: 'c1', runId: 'r1' }])
    })

    it('takes a tab under the name the user reads', () => {
        expect(readAgentPicks({ agents: [{ agentId: 'a1', tab: 'Apps' }] })[0].tab).toBe('services')
    })

    it('keeps the row of a tab the panel does not have, without a tab', () => {
        expect(readAgentPicks({ agents: [{ agentId: 'a1', tab: 'nowhere' }] })).toEqual([{ agentId: 'a1', tab: null, conversationId: null, runId: null }])
    })

    it('drops what is still being written', () => {
        expect(readAgentPicks(undefined)).toEqual([])
        expect(readAgentPicks({ agents: 'a1' })).toEqual([])
        expect(readAgentPicks({ agents: [{ agentId: 'a1' }, {}, null, { agentId: '' }] }).map(pick => pick.agentId)).toEqual(['a1'])
    })
})

const call = (toolCallId: string, toolName: string, input: unknown, state = 'output-available') => ({ type: `tool-${toolName}`, toolCallId, state, input })
const assistant = (...parts: { type: string }[]) => ({ role: 'assistant', parts })

describe('planAgentShortcuts', () => {
    it('folds a connector row, a chat row and their recap into the first call', () => {
        const plan = planAgentShortcuts([
            assistant(
                call('c1', 'open_connector_setup', { agentId: 'a1', slug: 'gmail' }),
                call('c2', 'show_agents', { agents: [{ agentId: 'a1', tab: 'chat' }] }),
                call('c3', 'show_agents', {
                    agents: [
                        { agentId: 'a1', tab: 'services' },
                        { agentId: 'a1', tab: 'chat' },
                    ],
                }),
                { type: 'text' }
            ),
        ])
        expect(plan.get('c1')?.map(pick => pick.tab)).toEqual(['services', 'chat'])
        expect(plan.get('c2')).toBeNull()
        expect(plan.get('c3')).toBeNull()
    })

    it('fills in the conversation a later row names', () => {
        const plan = planAgentShortcuts([assistant(call('c1', 'show_agents', { agents: [{ agentId: 'a1', tab: 'chat' }] }), call('c2', 'show_agents', { agents: [{ agentId: 'a1', tab: 'chat', conversationId: 'conv', runId: 'run' }] }))])
        expect(plan.get('c1')).toEqual([{ agentId: 'a1', tab: 'chat', conversationId: 'conv', runId: 'run' }])
    })

    it('leaves a failed call out, so it keeps its own step', () => {
        const plan = planAgentShortcuts([assistant(call('c1', 'show_agents', { agents: [{ agentId: 'a1' }] }, 'output-error'), call('c2', 'show_agents', { agents: [{ agentId: 'a2' }] }))])
        expect(plan.has('c1')).toBe(false)
        expect(plan.get('c2')?.map(pick => pick.agentId)).toEqual(['a2'])
    })

    it('reads the bridged name and keeps each message to itself', () => {
        const plan = planAgentShortcuts([assistant({ type: 'dynamic-tool', toolName: 'mcp__lumvika__show_agents', toolCallId: 'c1', state: 'output-available', input: { agents: [{ agentId: 'a1' }] } } as { type: string }), { role: 'user', parts: [{ type: 'text' }] }, assistant(call('c2', 'show_agents', { agents: [{ agentId: 'a1' }] }))])
        expect(plan.get('c1')).toHaveLength(1)
        expect(plan.get('c2')).toHaveLength(1)
    })
})
