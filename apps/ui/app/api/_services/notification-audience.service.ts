import 'server-only'

import type { Json } from '@/app/api/database.types'
import type { EngineCreatedEvent } from '@/lib/engine/types'
import { coworkerRuleOf, normalizeNotificationPrefs, type NotificationPrefs } from '@/lib/notifications/prefs'
import { selectMaybeSingle, serviceScope, updateRows, upsertRows } from '@/lib/db'

// Who wrote in a conversation is who its notifications reach. Best-effort: a message that went out
// must never fail because this bookkeeping did.
export async function recordSessionParticipant(sessionId: string | null | undefined, userId: string | null | undefined): Promise<void> {
    if (!sessionId || !userId) return
    try {
        const { error } = await upsertRows(serviceScope(), 'session_participants', { session_id: sessionId, user_id: userId, last_message_at: new Date().toISOString() }, { onConflict: ['session_id', 'user_id'] })
        if (error) console.error('[notifications] failed to record the participant', error)
    } catch (err) {
        console.error('[notifications] failed to record the participant', err)
    }
}

// Answering a conversation means its earlier results were read, even from a tab that never opened it.
export async function recordSessionRead(sessionId: string | null | undefined, userId: string | null | undefined): Promise<void> {
    if (!sessionId || !userId) return
    try {
        const { error } = await upsertRows(serviceScope(), 'session_reads', { session_id: sessionId, user_id: userId, seen_at: new Date().toISOString() }, { onConflict: ['session_id', 'user_id'] })
        if (error) console.error('[notifications] failed to record the read', error)
    } catch (err) {
        console.error('[notifications] failed to record the read', err)
    }
}

export async function writeNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<void> {
    const { error } = await updateRows(serviceScope(), 'users', { email_notification_prefs: prefs as unknown as Json }, { id: userId })
    if (error) throw new Error(error.message)
}

// The author of a scheduled task or a trigger follows its coworker, unless they already decided:
// a « Stop following » stays a stop. Best-effort, like the participant above.
export async function followCoworker(userId: string | null | undefined, agentId: string | null | undefined): Promise<void> {
    if (!userId || !agentId) return
    try {
        const { data } = await selectMaybeSingle(serviceScope(), 'users', ['email_notification_prefs'] as const, { id: userId })
        if (!data) return
        const prefs = normalizeNotificationPrefs(data.email_notification_prefs)
        const rule = coworkerRuleOf(prefs, agentId)
        if (rule.follow !== undefined) return
        await writeNotificationPrefs(userId, { ...prefs, coworkers: { ...prefs.coworkers, [agentId]: { ...rule, follow: true } } })
    } catch (err) {
        console.error('[notifications] failed to follow the coworker', err)
    }
}

// A schedule or a trigger the coworker wrote during a chat names the member who asked for it. Checked
// against the workspace, so a box can never make someone outside it follow anything.
export async function followAuthorOfCreatedTask(workspaceId: number, event: EngineCreatedEvent): Promise<void> {
    const authorId = event.metadata?.authorId
    if (event.event === 'box.connection.connected' || typeof authorId !== 'string' || !event.agentId) return
    try {
        const scope = serviceScope()
        const [{ data: member }, { data: agent }] = await Promise.all([
            selectMaybeSingle(scope, 'workspace_members', ['user_id'] as const, { workspace_id: workspaceId, user_id: authorId }),
            selectMaybeSingle(scope, 'agents', ['id'] as const, { workspace_id: workspaceId, engine_agent_id: event.agentId }),
        ])
        if (member && agent) await followCoworker(member.user_id, agent.id)
    } catch (err) {
        console.error('[notifications] failed to follow the author of a scheduled task', err)
    }
}
