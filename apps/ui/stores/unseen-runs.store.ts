import { create } from 'zustand'

import { listUnseenRunsAction, markRunsSeenAction } from '@/app/api/_actions/notification-reads.actions'
import { withoutSeenLocally, type UnseenRun } from '@/lib/notifications/unseen-runs'

type UnseenRunsState = {
    workspaceId: number | null
    userId: string | null
    runs: UnseenRun[]
    seenLocally: Record<string, number>
    // Conversations on screen right now: a run finishing in one of them is seen as it lands.
    viewing: Record<string, number>
    hydrate: (workspaceId: number, userId: string) => void
    refresh: () => Promise<void>
    markSeen: (sessionIds: string[]) => Promise<void>
    markAllSeen: () => Promise<void>
    view: (sessionId: string) => () => void
}

let refreshing: Promise<void> | null = null
let refreshAgain = false

export const useUnseenRunsStore = create<UnseenRunsState>()((set, get) => ({
    workspaceId: null,
    userId: null,
    runs: [],
    seenLocally: {},
    viewing: {},
    hydrate: (workspaceId, userId) => {
        if (get().workspaceId === workspaceId && get().userId === userId) return
        set({ workspaceId, userId, runs: [], seenLocally: {} })
        void get().refresh()
    },
    refresh: async () => {
        if (refreshing) {
            refreshAgain = true
            return refreshing
        }
        refreshing = (async () => {
            do {
                refreshAgain = false
                const { workspaceId } = get()
                if (workspaceId === null) return
                const data = await listUnseenRunsAction(workspaceId).catch(() => null)
                if (!data || get().workspaceId !== workspaceId) continue
                const runs = withoutSeenLocally(data, get().seenLocally)
                set({ runs })
                const onScreen = runs.filter(run => get().viewing[run.session_id] && isTabVisible()).map(run => run.session_id)
                if (onScreen.length) void get().markSeen(onScreen)
            } while (refreshAgain)
        })().finally(() => {
            refreshing = null
        })
        return refreshing
    },
    markSeen: async sessionIds => {
        const { userId, runs } = get()
        const ids = sessionIds.filter(id => runs.some(run => run.session_id === id))
        if (!userId || !ids.length) return
        // Hidden outright until the server says when it stamped the read: its clock, not the
        // browser's, is what `unseen_runs` compares the runs to.
        set(state => ({
            runs: state.runs.filter(run => !ids.includes(run.session_id)),
            seenLocally: { ...state.seenLocally, ...Object.fromEntries(ids.map(id => [id, Number.POSITIVE_INFINITY])) },
        }))
        const data = await markRunsSeenAction(ids).catch(() => null)
        if (!data) {
            console.error('[unseen-runs] failed to record the read')
            set(state => ({ seenLocally: Object.fromEntries(Object.entries(state.seenLocally).filter(([id]) => !ids.includes(id))) }))
            return
        }
        set(state => ({ seenLocally: { ...state.seenLocally, ...Object.fromEntries(data.map(row => [row.session_id, new Date(row.seen_at).getTime()])) } }))
    },
    markAllSeen: () => get().markSeen(get().runs.map(run => run.session_id)),
    view: sessionId => {
        set(state => ({ viewing: { ...state.viewing, [sessionId]: (state.viewing[sessionId] ?? 0) + 1 } }))
        void get().markSeen([sessionId])
        return () =>
            set(state => {
                const viewing = { ...state.viewing }
                if ((viewing[sessionId] ?? 0) <= 1) delete viewing[sessionId]
                else viewing[sessionId] -= 1
                return { viewing }
            })
    },
}))

const isTabVisible = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()
