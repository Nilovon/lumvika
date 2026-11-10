import { create } from 'zustand'
import { countBrainProposalsAction } from '@/app/api/_actions/brain.actions'

// The number of agent changes waiting for a person, shown on the workspace menu and on the
// Proposals tab. Refreshed on demand rather than pushed: the engine has no channel to the browser.
type BrainState = {
    openProposals: number
    // Bumped when the brain changed from outside the Brain dialog (the steward, from its chat), so
    // an open dialog reloads what it shows.
    version: number
    refreshProposalCount: () => Promise<void>
    setOpenProposals: (count: number) => void
    brainChanged: () => void
}

// A conversation reloaded with several brain changes in it mounts them all at once: one refresh.
const COALESCE_MS = 300
let pendingChange: ReturnType<typeof setTimeout> | null = null

export const useBrainStore = create<BrainState>((set, get) => ({
    openProposals: 0,
    version: 0,
    refreshProposalCount: async () => set({ openProposals: await countBrainProposalsAction() }),
    setOpenProposals: openProposals => set({ openProposals }),
    brainChanged: () => {
        if (pendingChange) clearTimeout(pendingChange)
        pendingChange = setTimeout(() => {
            pendingChange = null
            set(state => ({ version: state.version + 1 }))
            get().refreshProposalCount().catch(() => {})
        }, COALESCE_MS)
    },
}))
