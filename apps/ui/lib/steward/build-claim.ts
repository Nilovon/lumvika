import 'server-only'

import type { Database, Json } from '@/app/api/database.types'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectMaybeSingle } from '@/supabase/supabase-helpers'

type BuildInsert = Database['public']['Tables']['steward_builds']['Insert']
type BuildUpdate = Database['public']['Tables']['steward_builds']['Update']

// A hub that died in the middle of a build never releases its claim. Long enough for the slowest
// template install, short enough that the user is not locked out of their own team for good.
const STALE_AFTER_MS = 10 * 60_000

const UNIQUE_VIOLATION = '23505'

// `previous` is what the build before this one handed back, kept until this one is released: a
// request that claims right after another build landed has nothing left to build, and answers with it.
// `claimedAt` is the `started_at` this claim wrote: only the build holding it may release the row, so a
// build that outlived its claim does not free the one that took it over.
export type BuildClaim = { previous: Json | null; claimedAt: string }

/**
 * Takes the workspace's build, or `null` while another one runs. Two statements, each atomic: the
 * first build of a workspace inserts the row, any later one takes it back only once the previous
 * build has finished or gone stale. Under READ COMMITTED the second of two concurrent updates
 * re-reads the row after the first commits, finds it running, and matches nothing.
 */
export async function claimBuild(workspaceId: number): Promise<BuildClaim | null> {
    const supabase = createServiceRoleClient()
    const now = Date.now()
    const claimedAt = new Date(now).toISOString()
    const { error } = await supabase.from('steward_builds').insert<BuildInsert>({ workspace_id: workspaceId, started_at: claimedAt })
    if (!error) return { previous: null, claimedAt }
    if (error.code !== UNIQUE_VIOLATION) throw new Error(`Could not claim the team build: ${error.message}`)

    const staleBefore = new Date(now - STALE_AFTER_MS).toISOString()
    const { data, error: takeError } = await supabase
        .from('steward_builds')
        .update<BuildUpdate>({ started_at: claimedAt, finished_at: null })
        .eq('workspace_id', workspaceId)
        .or(`finished_at.not.is.null,started_at.lt.${staleBefore}`)
        .select('result')
    if (takeError) throw new Error(`Could not claim the team build: ${takeError.message}`)
    return data?.length ? { previous: data[0].result, claimedAt } : null
}

export async function releaseBuild(workspaceId: number, claimedAt: string, result: Json | null): Promise<void> {
    const supabase = createServiceRoleClient()
    const { error } = await supabase
        .from('steward_builds')
        .update<BuildUpdate>({ finished_at: new Date().toISOString(), result })
        .eq('workspace_id', workspaceId)
        .eq('started_at', claimedAt)
    if (error) throw new Error(`Could not release the team build: ${error.message}`)
}

/** What the last finished build of the workspace handed back, `null` while one is running or none ever ran. */
export async function finishedBuild(workspaceId: number): Promise<{ result: Json | null } | null> {
    const { data } = await selectMaybeSingle(createServiceRoleClient(), 'steward_builds', ['finished_at', 'result'] as const, { workspace_id: workspaceId })
    return data?.finished_at ? { result: data.result } : null
}
