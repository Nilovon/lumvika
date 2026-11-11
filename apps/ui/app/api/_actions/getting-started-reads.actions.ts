'use server'

import { z } from 'zod'

import { getRequestScope } from '@/lib/auth/session/request'
import { selectMany } from '@/lib/db'

// The getting-started steps the workspace has already done, read as the caller under row level security.
export async function listGettingStartedItemsAction(workspaceId: number): Promise<string[]> {
    const parsed = z.number().int().positive().safeParse(workspaceId)
    if (!parsed.success) return []
    const { data } = await selectMany(await getRequestScope(), 'workspace_getting_started', ['item'] as const, { workspace_id: parsed.data })
    return (data ?? []).map(row => row.item)
}
