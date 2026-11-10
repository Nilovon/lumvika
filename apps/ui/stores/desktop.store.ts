import type { TakeoverResult } from '@rerun/contracts'
import { create } from 'zustand'

// The browser an agent asked a person to take over, and the chat card that asked for it.
export type TakeoverTarget = { agentId: string; url: string; reason: string; callId: string }

type DesktopState = {
    // The agent whose screen is open to drive, in a dialog over its sheet. One at a time.
    agentId: string | null
    takeover: TakeoverTarget | null
    // Keyed by the chat call that asked: the card it belongs to may have unmounted while the
    // desktop was open, and resumes the run when it reads its entry back.
    handedBack: Record<string, TakeoverResult>
    openDesktop: (agentId: string) => void
    openTakeover: (target: TakeoverTarget) => void
    handBack: (callId: string, result: TakeoverResult) => void
    // Closing the view leaves a takeover open on the machine: the card offers to come back to it.
    close: () => void
}

export const useDesktopStore = create<DesktopState>(set => ({
    agentId: null,
    takeover: null,
    handedBack: {},
    openDesktop: agentId => set({ agentId, takeover: null }),
    openTakeover: target => set({ agentId: target.agentId, takeover: target }),
    handBack: (callId, result) => set(state => ({ agentId: null, takeover: null, handedBack: { ...state.handedBack, [callId]: result } })),
    close: () => set({ agentId: null, takeover: null }),
}))
