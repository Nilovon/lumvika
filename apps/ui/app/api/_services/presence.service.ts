import type { PresenceRow } from '@/lib/notifications/presence'
import { callScalar, deleteRows, selectMany, serviceScope, upsertRows, type DbScope } from '@/lib/db'

// `last_seen_at` is stamped here rather than sent by the tab: a browser clock that runs fast would
// otherwise let someone silence their own emails.
export async function touchPresence(userId: string): Promise<void> {
    const { error } = await upsertRows(serviceScope(), 'user_presence', { user_id: userId, last_seen_at: new Date().toISOString() }, { onConflict: ['user_id'] })
    if (error) console.error('[presence] heartbeat failed', error)
}

// A visible tab is the sign of life the sandbox idle sweep reads. The function throttles itself to
// one write an hour, and a failure costs nothing: the next heartbeat is thirty seconds away.
export async function touchSandboxActivity(userId: string): Promise<void> {
    const { error } = await callScalar<null>(serviceScope(), 'touch_sandbox_activity', { p_user_id: userId })
    if (error) console.error('[presence] sandbox activity stamp failed', error)
}

export async function clearPresence(userId: string): Promise<void> {
    const { error } = await deleteRows(serviceScope(), 'user_presence', { user_id: userId })
    if (error) console.error('[presence] clear failed', error)
}

// A failed read answers "nobody is here", so the emails go out. That is the only direction it is
// acceptable to be wrong in: the alternative silences a notification over a network blip.
export async function loadPresence(scope: DbScope, userIds: string[]): Promise<PresenceRow[]> {
    if (!userIds.length) return []
    const { data, error } = await selectMany(scope, 'user_presence', ['user_id', 'last_seen_at'] as const, { user_id: userIds })
    if (error) {
        console.error('[presence] lookup failed', error)
        return []
    }
    return data ?? []
}
