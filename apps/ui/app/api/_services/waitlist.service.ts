import { findWorkspaceEngine } from '@/app/api/_services/workspace-engine.service'
import { poolHasRoom } from '@lumvika/cloud/engines'
import { selectMaybeSingle, serviceScope, updateRows } from '@/lib/db'

// Whether a workspace that still has no machine must wait for one. Decided from the pool on every
// read rather than from a stored state: the wall lifts on its own the moment an engine is available
// again, and nothing has to admit anyone. `waitlisted_at` is only the record of who was turned away
// and when, stamped once and never cleared.
//
// A paused workspace is never turned away: it already had a machine, its customer is paying to get
// it back, and the restore retries on its own until a machine frees up.
export async function resolveEngineWaitlist(workspaceId: number): Promise<boolean> {
    if (await findWorkspaceEngine(workspaceId)) return false

    const scope = serviceScope()
    const { data } = await selectMaybeSingle(scope, 'workspaces', ['waitlisted_at', 'boxes_archived_at'] as const, { id: workspaceId })
    if (data?.boxes_archived_at) return false

    if (await poolHasRoom()) return false

    if (!data?.waitlisted_at) {
        const { error } = await updateRows(scope, 'workspaces', { waitlisted_at: new Date().toISOString() }, { id: workspaceId })
        if (error) console.error('[waitlist] failed to stamp workspace', workspaceId, error.message)
    }
    return true
}
