import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { AnnouncedNotification } from '@/lib/notifications/announcement'
import { useStewardStore } from '@/stores/steward.store'

type NotificationsState = {
    open: boolean
    // Agent the dialog should land on when it opens; null means the global "All agents" view.
    targetAgentId: string | null
    openNotifications: (agentId?: string) => void
    setOpen: (open: boolean) => void
    // The one-shot dialog asking to turn on browser notifications. Held back for the whole onboarding
    // funnel: it opens once the team is built, or on the first message sent by a workspace that was
    // already past it. Never restored on load, unlike the flag below.
    permissionPromptOpen: boolean
    // Set as soon as the dialog has been answered, whichever way: closing it counts as a refusal.
    // Persisted so the question is asked once and never again.
    permissionAsked: boolean
    askPermission: () => void
    answerPermission: () => void
    // What the hub announces above its pill, in arrival order. Never restored on load.
    arrivals: AnnouncedNotification[]
    announce: (notification: AnnouncedNotification) => void
}

export const useNotificationsStore = create<NotificationsState>()(
    persist(
        (set, get) => ({
            open: false,
            targetAgentId: null,
            openNotifications: agentId => set({ open: true, targetAgentId: agentId ?? null }),
            setOpen: open => set({ open }),
            permissionPromptOpen: false,
            permissionAsked: false,
            askPermission: () => {
                if (get().permissionAsked || useStewardStore.getState().funnel !== 'companion') return
                set({ permissionPromptOpen: true })
            },
            answerPermission: () => set({ permissionPromptOpen: false, permissionAsked: true }),
            arrivals: [],
            announce: notification => set(state => ({ arrivals: [...state.arrivals, notification] })),
        }),
        {
            name: 'lumvika:notifications-ui',
            partialize: state => ({ permissionAsked: state.permissionAsked }),
        }
    )
)
