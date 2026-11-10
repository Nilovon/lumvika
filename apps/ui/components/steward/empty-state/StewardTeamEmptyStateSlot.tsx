'use client'

import { StewardTeamEmptyState, StewardTeamEmptyStateSkeleton } from './StewardTeamEmptyState'
import { useStewardTeamEmptyState } from './useStewardTeamEmptyState'

export function StewardTeamEmptyStateSlot({ onSend, onPrefill }: { onSend?: (text: string) => void; onPrefill?: (text: string) => void }) {
    const state = useStewardTeamEmptyState()
    if (!state) return <StewardTeamEmptyStateSkeleton />
    return <StewardTeamEmptyState model={state.model} now={state.now} onSend={onSend} onPrefill={onPrefill} />
}
