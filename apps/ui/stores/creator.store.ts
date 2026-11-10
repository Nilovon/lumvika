import { create } from 'zustand'

// Which pane of the creator panel is showing. A discriminated union rather than an id plus two
// booleans, so "a template is selected" and "payouts are showing" cannot both be true.
export type CreatorPane = { kind: 'empty' } | { kind: 'template'; id: string } | { kind: 'payouts' } | { kind: 'revenue' }

type CreatorState = {
    open: boolean
    pane: CreatorPane
    createOpen: boolean
    // Stripe redirects here when an onboarding link has expired on the way. Consumed once by the
    // payouts pane, which mints a fresh link immediately.
    connectRefresh: boolean
    openCreator: (pane?: CreatorPane) => void
    setPane: (pane: CreatorPane) => void
    setOpen: (open: boolean) => void
    setCreateOpen: (open: boolean) => void
    setConnectRefresh: (value: boolean) => void
}

// In a store rather than in the toolbar's own state, because the return from Stripe's hosted
// onboarding lands on the home page: HomeContent has to be able to reopen the panel on the payouts
// pane, and it is nowhere near the toolbar.
export const useCreatorStore = create<CreatorState>(set => ({
    open: false,
    pane: { kind: 'empty' },
    createOpen: false,
    connectRefresh: false,
    openCreator: pane => set({ open: true, pane: pane ?? { kind: 'empty' } }),
    setPane: pane => set({ pane }),
    setOpen: open => set(open ? { open } : { open: false, pane: { kind: 'empty' }, connectRefresh: false }),
    setCreateOpen: createOpen => set({ createOpen }),
    setConnectRefresh: connectRefresh => set({ connectRefresh }),
}))
