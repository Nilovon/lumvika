import { buddyMoodOfStatus, type BuddyMood } from '@rerun/ui/iso-grid'

import { useBoardStore } from '@/stores/board.store'

// The mood the board shows for this agent, for its buddy drawn elsewhere in the app.
export function useAgentBuddyMood(agentId: string | null | undefined): BuddyMood {
    return useBoardStore(s => {
        const agent = agentId ? s.agents.find(a => a.id === agentId) : undefined
        return agent ? buddyMoodOfStatus(agent.status, !!agent.disabledAt) : 'idle'
    })
}
