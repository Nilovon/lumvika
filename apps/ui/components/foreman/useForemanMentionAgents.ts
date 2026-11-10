'use client'

import { useMemo } from 'react'

import type { MentionAgent } from '@/components/chat/MentionAutocomplete'
import { useBoardStore } from '@/stores/board.store'

export function useForemanMentionAgents(): MentionAgent[] {
    const agents = useBoardStore(state => state.agents)
    const spaces = useBoardStore(state => state.spaces)
    return useMemo(() => {
        const boxNames = new Map(spaces.map(space => [space.id, space.name]))
        return agents.filter(agent => !agent.disabledAt).map(agent => ({ id: agent.id, name: agent.name, handle: agent.handle, hint: boxNames.get(agent.spaceId) ?? undefined }))
    }, [agents, spaces])
}
