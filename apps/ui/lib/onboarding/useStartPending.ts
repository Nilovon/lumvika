'use client'

import { useStartPendingAgent } from '@/lib/onboarding/useStartPendingAgent'
import { useStartPendingAgentShare } from '@/lib/onboarding/useStartPendingAgentShare'
import { useStartPendingTemplate } from '@/lib/onboarding/useStartPendingTemplate'
import { useOnboardingStore } from '@/stores/onboarding.store'
import { useCallback } from 'react'

// One terminus for whatever the workspace is waiting on. The callers (checkout return, invitation
// code, post-conversion replay) do not care whether it is a drafted agent, a shared template or a
// shared agent.
export function useStartPending() {
    const startPendingAgent = useStartPendingAgent()
    const startPendingTemplate = useStartPendingTemplate()
    const startPendingAgentShare = useStartPendingAgentShare()

    return useCallback(async (): Promise<boolean> => {
        const { pendingTemplate, pendingFirstAgent, pendingShareLink } = useOnboardingStore.getState()
        if (pendingTemplate) return startPendingTemplate()
        if (pendingFirstAgent) return startPendingAgent()
        if (pendingShareLink) return startPendingAgentShare()
        return false
    }, [startPendingAgent, startPendingTemplate, startPendingAgentShare])
}
