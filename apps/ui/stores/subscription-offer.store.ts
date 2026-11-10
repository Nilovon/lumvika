import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SubscriptionOfferState = {
    // The one-shot dialog offering to run coworkers on a Claude or ChatGPT plan, opened before the
    // first install starts. Never restored on load, unlike the flag below.
    open: boolean
    agentId: string | null
    // Set as soon as the dialog has been left, whichever way. Persisted so the offer is made once.
    offered: boolean
    // The install held back until the offer is left, so its first run bills whatever was picked.
    release: (() => void) | null
    offer: (agentId: string) => Promise<void>
    answer: () => void
}

export const useSubscriptionOfferStore = create<SubscriptionOfferState>()(
    persist(
        (set, get) => ({
            open: false,
            agentId: null,
            offered: false,
            release: null,
            offer: agentId =>
                new Promise<void>(resolve => {
                    if (get().offered) return resolve()
                    const waiting = get().release
                    set({
                        open: true,
                        agentId,
                        release: () => {
                            waiting?.()
                            resolve()
                        },
                    })
                }),
            answer: () => {
                const { release } = get()
                set({ open: false, offered: true, release: null })
                release?.()
            },
        }),
        {
            name: 'rerun:subscription-offer',
            partialize: state => ({ offered: state.offered }),
        }
    )
)
