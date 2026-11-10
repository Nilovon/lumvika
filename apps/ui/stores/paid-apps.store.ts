import { create } from 'zustand'
import { getAppsOverviewAction } from '@/app/api/_actions/apps.actions'
import type { AppSlug } from '@/lib/apps/types'

// A paid app's dialog is opened from the workspace menu, from a coworker's Services, from billing
// and from a notification: a store rather than a prop, like the workspace settings panels. One app
// dialog is open at a time.
type PaidAppsState = {
    openSlug: AppSlug | null
    // Lands straight on the sign-in of this account rather than on the list.
    reconnectId: string | null
    // Bumped whenever an account is connected or removed, for the views that list accounts.
    revision: number
    // How many accounts each app holds, for the menu entry that appears with the first one.
    accountCounts: Partial<Record<AppSlug, number>>
    openApp: (slug: AppSlug, reconnectId?: string) => void
    closeApp: () => void
    bumpRevision: () => void
    refreshAccountCount: (slug: AppSlug) => Promise<void>
}

export const usePaidAppsStore = create<PaidAppsState>(set => ({
    openSlug: null,
    reconnectId: null,
    revision: 0,
    accountCounts: {},
    openApp: (slug, reconnectId) => set({ openSlug: slug, reconnectId: reconnectId ?? null }),
    closeApp: () => set({ openSlug: null, reconnectId: null }),
    bumpRevision: () => set(state => ({ revision: state.revision + 1 })),
    refreshAccountCount: async slug => {
        const result = await getAppsOverviewAction(slug)
        if (result.ok) set(state => ({ accountCounts: { ...state.accountCounts, [slug]: result.value.connections.filter(connection => connection.status !== 'connecting').length } }))
    },
}))
