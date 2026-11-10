'use client'

import { useBoardStore } from '@/stores/board.store'
import { track } from '@rerun/analytics/client'

export type ScratchAgent = { name: string; serviceSlugs: string[]; kickoff: string; suggestionId: string | null }

// The agent described in the New agent dialog, on its way to the board: a name, the apps it starts
// with and its first job, then straight to grid placement. Nothing is written anywhere until the
// tile is dropped.
//
// The kickoff rides on the draft and is sent verbatim as the opening chat message once the agent
// exists; the apps are attached as it is created. `spaceId` is the Box the agent was asked for, when
// it was asked from one: the tile then only drops there.
export function useStartScratchAgent() {
    const beginAgentPlacement = useBoardStore(s => s.beginAgentPlacement)
    const isFirstAgent = useBoardStore(s => s.spaces.length === 0)

    return ({ name, serviceSlugs, kickoff, suggestionId }: ScratchAgent, spaceId: string | null = null) => {
        beginAgentPlacement({ name: name.trim(), serviceSlugs, kickoff }, spaceId)
        if (isFirstAgent) track('first_agent_created', { template: suggestionId ? `suggestion:${suggestionId}` : 'scratch' })
    }
}
