'use client'

import { ForemanTeamEmptyState, ForemanTeamEmptyStateSkeleton } from './ForemanTeamEmptyState'
import { useForemanTeamEmptyState } from './useForemanTeamEmptyState'

export function ForemanTeamEmptyStateSlot({ onSend, onPrefill }: { onSend?: (text: string) => void; onPrefill?: (text: string) => void }) {
    const state = useForemanTeamEmptyState()
    if (!state) return <ForemanTeamEmptyStateSkeleton />
    return <ForemanTeamEmptyState model={state.model} now={state.now} onSend={onSend} onPrefill={onPrefill} />
}
