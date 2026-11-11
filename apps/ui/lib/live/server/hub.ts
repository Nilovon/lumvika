import type { LiveBroadcast, LiveChange } from '@/lib/live/protocol'

export type LiveEvent = { kind: 'change'; change: LiveChange } | { kind: 'broadcast'; broadcast: LiveBroadcast } | { kind: 'resync' }

// One open stream: a user, the workspaces they are a member of, and where its events go.
export interface LiveSubscriber {
    readonly userId: string
    readonly workspaces: ReadonlySet<number>
    send(event: LiveEvent): void
    join(workspaceId: number): void
    leave(workspaceId: number): void
    remove(): void
}

export interface LiveHub {
    add(userId: string, workspaces: Iterable<number>, send: (event: LiveEvent) => void): LiveSubscriber
    // The streams a change of this workspace, or of this user's own rows, concerns.
    audience(target: { workspaceId?: number | null; userId?: string | null }): Set<LiveSubscriber>
    streamsOf(userId: string): ReadonlySet<LiveSubscriber>
    // Tells every stream, after the database connection was lost and opened again.
    resync(): void
    size(): number
}

function addTo<K>(index: Map<K, Set<LiveSubscriber>>, key: K, subscriber: LiveSubscriber) {
    const set = index.get(key) ?? new Set()
    set.add(subscriber)
    index.set(key, set)
}

function removeFrom<K>(index: Map<K, Set<LiveSubscriber>>, key: K, subscriber: LiveSubscriber) {
    const set = index.get(key)
    if (!set) return
    set.delete(subscriber)
    if (set.size === 0) index.delete(key)
}

export function createLiveHub(): LiveHub {
    const byWorkspace = new Map<number, Set<LiveSubscriber>>()
    const byUser = new Map<string, Set<LiveSubscriber>>()

    return {
        add(userId, initial, send) {
            const workspaces = new Set<number>()
            let removed = false
            const subscriber: LiveSubscriber = {
                userId,
                workspaces,
                send,
                join(workspaceId) {
                    if (removed || workspaces.has(workspaceId)) return
                    workspaces.add(workspaceId)
                    addTo(byWorkspace, workspaceId, subscriber)
                },
                leave(workspaceId) {
                    if (!workspaces.delete(workspaceId)) return
                    removeFrom(byWorkspace, workspaceId, subscriber)
                },
                remove() {
                    if (removed) return
                    removed = true
                    for (const workspaceId of workspaces) removeFrom(byWorkspace, workspaceId, subscriber)
                    workspaces.clear()
                    removeFrom(byUser, userId, subscriber)
                },
            }
            addTo(byUser, userId, subscriber)
            for (const workspaceId of initial) subscriber.join(workspaceId)
            return subscriber
        },
        audience({ workspaceId, userId }) {
            const found = new Set<LiveSubscriber>(workspaceId == null ? [] : byWorkspace.get(workspaceId))
            if (userId) for (const subscriber of byUser.get(userId) ?? []) found.add(subscriber)
            return found
        },
        streamsOf(userId) {
            return byUser.get(userId) ?? new Set()
        },
        resync() {
            for (const subscribers of byUser.values()) for (const subscriber of subscribers) subscriber.send({ kind: 'resync' })
        },
        size() {
            let total = 0
            for (const subscribers of byUser.values()) total += subscribers.size
            return total
        },
    }
}
