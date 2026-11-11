import type { LiveTable } from '@/lib/live/protocol'
import type { LiveHub, LiveSubscriber } from '@/lib/live/server/hub'
import type { LiveNotification, RowNotification } from '@/lib/live/server/notification'

// The row as `userId` may see it under row level security, null when it is hidden or gone.
export type ReadRowAs = (userId: string, table: LiveTable, key: Record<string, string | number>) => Promise<Record<string, unknown> | null>

type DispatcherOptions = {
    hub: LiveHub
    readRowAs: ReadRowAs
    onError?: (error: unknown) => void
}

export interface LiveDispatcher {
    dispatch(notification: LiveNotification): void
    // Resolves once every change handed over so far has been sent.
    idle(): Promise<void>
}

function byUser(subscribers: Iterable<LiveSubscriber>): Map<string, LiveSubscriber[]> {
    const grouped = new Map<string, LiveSubscriber[]>()
    for (const subscriber of subscribers) grouped.set(subscriber.userId, [...(grouped.get(subscriber.userId) ?? []), subscriber])
    return grouped
}

// Each user's changes go out in the order they were committed: a row read again for an UPDATE
// cannot land after the DELETE that followed it. Different users are served side by side.
export function createLiveDispatcher({ hub, readRowAs, onError = error => console.error('[live] dispatch failed', error) }: DispatcherOptions): LiveDispatcher {
    const queues = new Map<string, Promise<void>>()

    function enqueue(userId: string, task: () => Promise<void>) {
        const next = (queues.get(userId) ?? Promise.resolve()).then(task).catch(onError)
        queues.set(userId, next)
        void next.then(() => {
            if (queues.get(userId) === next) queues.delete(userId)
        })
    }

    // A membership opens or closes a workspace's changes to the user's streams that are already open.
    function followMembership(notification: RowNotification, userId: string, row: Record<string, unknown>) {
        if (notification.table !== 'workspace_members' || row.user_id !== userId || typeof row.workspace_id !== 'number') return
        for (const stream of hub.streamsOf(userId)) {
            if (notification.op === 'DELETE') stream.leave(row.workspace_id)
            else stream.join(row.workspace_id)
        }
    }

    function dispatchRow(notification: RowNotification) {
        const { table, op, key } = notification
        for (const [userId, subscribers] of byUser(hub.audience({ workspaceId: notification.workspace_id, userId: notification.user_id }))) {
            enqueue(userId, async () => {
                const row = op === 'DELETE' ? { ...key, ...notification.old } : await readRowAs(userId, table, key)
                if (!row) return
                for (const subscriber of subscribers) subscriber.send({ kind: 'change', change: { table, op, row } })
                followMembership(notification, userId, row)
            })
        }
    }

    return {
        dispatch(notification) {
            if (notification.kind === 'row') {
                dispatchRow(notification)
                return
            }
            for (const subscriber of hub.audience({ workspaceId: notification.workspace_id })) {
                if (subscriber.userId === notification.from) continue
                subscriber.send({ kind: 'broadcast', broadcast: { workspaceId: notification.workspace_id, event: notification.event, payload: notification.payload } })
            }
        },
        async idle() {
            while (queues.size > 0) await Promise.all(queues.values())
        },
    }
}
