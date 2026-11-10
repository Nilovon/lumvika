'use client'

import { useBrainStore } from '@/stores/brain.store'
import { useEffect } from 'react'

const POLL_MS = 2 * 60 * 1000

// The engine cannot push to the browser, so the count of agent changes waiting for review is read
// on mount, every couple of minutes while the tab is visible, and whenever the tab comes back.
export function useBrainProposalCount(enabled: boolean): number {
    const openProposals = useBrainStore(s => s.openProposals)
    const refresh = useBrainStore(s => s.refreshProposalCount)

    useEffect(() => {
        if (!enabled) return
        const tick = () => {
            if (document.visibilityState === 'visible') refresh().catch(() => {})
        }
        tick()
        const timer = setInterval(tick, POLL_MS)
        document.addEventListener('visibilitychange', tick)
        return () => {
            clearInterval(timer)
            document.removeEventListener('visibilitychange', tick)
        }
    }, [enabled, refresh])

    return enabled ? openProposals : 0
}
