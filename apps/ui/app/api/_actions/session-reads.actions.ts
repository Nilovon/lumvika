'use server'

import { z } from 'zod'

import { getRequestScope } from '@/lib/auth/session/request'
import { selectMany, selectMaybeSingle } from '@/lib/db'
import { ATTENTION_NOTIFICATION_COLUMNS, attentionNotificationsFilter, type AttentionNotificationRow, type AttentionSessionRow } from '@/lib/notifications/attention-details'

// Reads of a conversation's row for the chat panels, made as the caller under row level security.

const idSchema = z.guid()
const MAX_ATTENTION_SESSIONS = 500

// The coworker that opened this conversation through `call_agent`, null when a person did.
export async function getSessionOriginAgentAction(sessionId: string): Promise<string | null> {
    const parsed = idSchema.safeParse(sessionId)
    if (!parsed.success) return null
    const { data } = await selectMaybeSingle(await getRequestScope(), 'sessions', ['origin_agent_id'] as const, { id: parsed.data })
    return data?.origin_agent_id ?? null
}

export async function getSessionUpdatedAtAction(sessionId: string): Promise<string | null> {
    const parsed = idSchema.safeParse(sessionId)
    if (!parsed.success) return null
    const { data } = await selectMaybeSingle(await getRequestScope(), 'sessions', ['updated_at'] as const, { id: parsed.data })
    return data?.updated_at ?? null
}

// The sessions waiting on the user and, newest first, the notifications that say what each waits
// for. null when the sessions could not be read.
export async function loadAttentionRowsAction(sessionIds: string[]): Promise<{ sessions: AttentionSessionRow[]; notifications: AttentionNotificationRow[] } | null> {
    const parsed = z.array(idSchema).max(MAX_ATTENTION_SESSIONS).safeParse(sessionIds)
    if (!parsed.success) return null
    if (parsed.data.length === 0) return { sessions: [], notifications: [] }
    const scope = await getRequestScope()
    const { data: sessions } = await selectMany(scope, 'sessions', ['id', 'agent_id', 'engine_session_id', 'title', 'updated_at'] as const, { id: { in: parsed.data } })
    if (!sessions) return null

    const filter = attentionNotificationsFilter(sessions)
    const { data: notifications } = filter ? await selectMany(scope, 'notifications', ATTENTION_NOTIFICATION_COLUMNS, filter, { column: 'created_at', ascending: false }) : { data: [] }
    return { sessions, notifications: notifications ?? [] }
}
