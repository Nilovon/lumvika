'use server'

import { rewindPayloadSchema, type RewindPayload } from '@lumvika/contracts'
import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { selectMany, selectMaybeSingle, upsertRows } from '@/lib/db'

const MAX_WEEKS = 52

export type RewindWeekEntry = { id: string; weekStart: string; viewed: boolean }

// Newest first. No payloads: the picker only needs the weeks, a story is read when it is opened.
export async function listRewindsAction(): Promise<RewindWeekEntry[]> {
    const { scope, workspace, userId } = await requireWorkspaceContext()
    const { data: rewinds } = await selectMany(scope, 'workspace_rewinds', ['id', 'week_start'] as const, { workspace_id: workspace.id }, { column: 'week_start', ascending: false }, MAX_WEEKS)
    if (!rewinds?.length) return []

    const { data: views } = await selectMany(scope, 'workspace_rewind_views', ['rewind_id'] as const, { rewind_id: rewinds.map(rewind => rewind.id), user_id: userId })
    const viewed = new Set((views ?? []).map(view => view.rewind_id))
    return rewinds.map(rewind => ({ id: rewind.id, weekStart: rewind.week_start, viewed: viewed.has(rewind.id) }))
}

export async function readRewindAction(rewindId: string): Promise<RewindPayload | null> {
    const { scope, workspace } = await requireWorkspaceContext()
    const { data } = await selectMaybeSingle(scope, 'workspace_rewinds', ['payload'] as const, { id: rewindId, workspace_id: workspace.id })
    const parsed = rewindPayloadSchema.safeParse(data?.payload)
    return parsed.success ? parsed.data : null
}

export async function markRewindViewedAction(rewindId: string): Promise<void> {
    const { scope, workspace, userId } = await requireWorkspaceContext()
    const { data: rewind } = await selectMaybeSingle(scope, 'workspace_rewinds', ['id'] as const, { id: rewindId, workspace_id: workspace.id })
    if (!rewind) return
    await upsertRows(scope, 'workspace_rewind_views', { rewind_id: rewind.id, user_id: userId }, { onConflict: ['rewind_id', 'user_id'], ignoreDuplicates: true })
}
