import { agentConversationsOverviewSchema } from '@lumvika/contracts'

const latest = (source: string) => ({ id: 'c1', agentId: 'a1', engineSessionId: 'e1', title: 'ENG-4: Write the launch post', status: 'idle', source, updatedAt: '2026-11-12T10:00:00Z', originAgentName: null })

describe('the board overview the app parses', () => {
    it('reads a conversation source this build does not know as agent instead of failing the board', () => {
        const parsed = agentConversationsOverviewSchema.parse([
            { agentId: 'a1', latest: latest('a_source_from_the_future'), pending: 0 },
            { agentId: 'a2', latest: latest('schedule'), pending: 1 },
        ])
        expect(parsed.map(row => row.latest?.source)).toEqual(['agent', 'schedule'])
    })
})
