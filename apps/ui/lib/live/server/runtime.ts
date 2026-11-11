import 'server-only'

import { LIVE_CHANNEL, notifyLive, openListenClient, readRowByKey, selectMany, userScope } from '@/lib/db'
import type { BroadcastEvent } from '@/lib/live/protocol'
import { createLiveDispatcher, type ReadRowAs } from '@/lib/live/server/dispatch'
import { createLiveHub, type LiveHub } from '@/lib/live/server/hub'
import { startLiveListener } from '@/lib/live/server/listener'
import { parseLiveNotification, type BroadcastNotification } from '@/lib/live/server/notification'

type LiveRuntime = { hub: LiveHub }

// One hub and one LISTEN connection per process, kept across the module reloads of `next dev`.
const holder = globalThis as typeof globalThis & { __lumvikaLive?: LiveRuntime }

const PERMISSION_DENIED = '42501'

export const readRowAs: ReadRowAs = async (userId, table, key) => {
    const { data, error } = await readRowByKey(userScope(userId), table, key)
    if (error && error.code !== PERMISSION_DENIED) throw error
    return (data as Record<string, unknown> | null) ?? null
}

function start(): LiveRuntime {
    const hub = createLiveHub()
    const dispatcher = createLiveDispatcher({ hub, readRowAs })
    startLiveListener({
        channel: LIVE_CHANNEL,
        connect: () => openListenClient(),
        onNotification: payload => {
            const notification = parseLiveNotification(payload)
            if (notification) dispatcher.dispatch(notification)
        },
        onOpen: () => hub.resync(),
        onFailure: error => console.error('[live] database connection lost', error),
    })
    return { hub }
}

export function liveHub(): LiveHub {
    holder.__lumvikaLive ??= start()
    return holder.__lumvikaLive.hub
}

export async function memberWorkspaces(userId: string): Promise<number[] | null> {
    const { data, error } = await selectMany(userScope(userId), 'workspace_members', ['workspace_id'], { user_id: userId })
    if (error) return null
    return data.map(row => row.workspace_id)
}

export function publishBroadcast(notification: Omit<BroadcastNotification, 'kind'> & { event: BroadcastEvent }): Promise<void> {
    return notifyLive({ kind: 'broadcast', ...notification } satisfies BroadcastNotification)
}
