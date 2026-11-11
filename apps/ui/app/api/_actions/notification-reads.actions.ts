'use server'

import { z } from 'zod'

import { getRequestScope } from '@/lib/auth/session/request'
import { callRows, selectMaybeSingle, upsertRows } from '@/lib/db'
import type { UnseenRun } from '@/lib/notifications/unseen-runs'

// The inbox's reads and its read receipts, made as the caller under row level security.

const idSchema = z.guid()
const MAX_SEEN = 500

export type NotificationLink = { agentId: string | null; engineSessionId: string | null; engineRunId: string | null }

// What a notification email links to. null for a row the caller cannot read (another workspace,
// deleted since) or an id that is not one.
export async function findNotificationLinkAction(notificationId: string): Promise<NotificationLink | null> {
    const parsed = idSchema.safeParse(notificationId)
    if (!parsed.success) return null
    const { data } = await selectMaybeSingle(await getRequestScope(), 'notifications', ['agent_id', 'engine_session_id', 'engine_run_id'] as const, { id: parsed.data })
    return data ? { agentId: data.agent_id, engineSessionId: data.engine_session_id, engineRunId: data.engine_run_id } : null
}

// null when the read failed, so the inbox keeps what it shows.
export async function listUnseenRunsAction(workspaceId: number): Promise<UnseenRun[] | null> {
    const parsed = z.number().int().positive().safeParse(workspaceId)
    if (!parsed.success) return null
    const { data, error } = await callRows<UnseenRun>(await getRequestScope(), 'unseen_runs', { p_workspace_id: parsed.data })
    return error ? null : data
}

// When the server stamped each read: its clock, not the browser's, is what `unseen_runs` compares
// the runs to. The trigger on `session_reads` stamps `seen_at` on insert and on update alike, so a
// session read again moves forward. null when the read could not be recorded.
export async function markRunsSeenAction(sessionIds: string[]): Promise<{ session_id: string; seen_at: string }[] | null> {
    const parsed = z.array(idSchema).min(1).max(MAX_SEEN).safeParse(sessionIds)
    if (!parsed.success) return null
    const scope = await getRequestScope()
    const userId = scope.userId
    if (!userId) return null
    const { data, error } = await upsertRows(
        scope,
        'session_reads',
        parsed.data.map(sessionId => ({ session_id: sessionId, user_id: userId })),
        { onConflict: ['session_id', 'user_id'], update: ['user_id'], returning: ['session_id', 'seen_at'] },
    )
    return error ? null : data
}
