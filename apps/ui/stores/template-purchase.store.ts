import { create } from 'zustand'

type TemplatePurchaseState = {
    // Bumped when a purchase lands, so the library dialog knows its cached list is stale. It caches
    // for the lifetime of the app otherwise, and a template bought two seconds ago would still read
    // as "Buy".
    version: number
    bumpVersion: () => void
}

// Deliberately not folded into the onboarding store: `setPendingTemplate` there clears the pending
// first agent because only one thing can claim a Space, and a purchase claims nothing.
export const useTemplatePurchaseStore = create<TemplatePurchaseState>(set => ({
    version: 0,
    bumpVersion: () => set(state => ({ version: state.version + 1 })),
}))
