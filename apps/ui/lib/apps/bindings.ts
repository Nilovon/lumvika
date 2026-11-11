import { getWorkspaceConnection } from '@/app/api/_services/workspace-engine.service'
import { deleteTrigger } from '@/lib/engine/client'
import { deleteRows, selectMaybeSingle, updateRows, type DbScope } from '@/lib/db'
import type { AppSlug } from './types'

// Removes the coworker's wake-up trigger from its engine and forgets it. Best effort on the engine
// side: a box that is gone has no trigger left to remove.
export async function dropWakeTrigger(scope: DbScope, workspaceId: number, agentId: string, slug: AppSlug): Promise<void> {
    const { data: binding } = await selectMaybeSingle(scope, 'app_connection_agents', ['trigger_slug'] as const, { agent_id: agentId, app_slug: slug })
    if (!binding?.trigger_slug) return
    const { data: agent } = await selectMaybeSingle(scope, 'agents', ['engine_agent_id'] as const, { id: agentId })
    if (agent?.engine_agent_id) {
        const conn = await getWorkspaceConnection(workspaceId).catch(() => null)
        if (conn) await deleteTrigger(conn, agent.engine_agent_id, binding.trigger_slug).catch(err => console.warn(`[apps:${slug}] could not delete the wake trigger`, err))
    }
    const { error } = await updateRows(scope, 'app_connection_agents', { trigger_slug: null, trigger_token: null, wake_on_events: [], updated_at: new Date().toISOString() }, { agent_id: agentId, app_slug: slug })
    if (error) throw new Error(error.message)
}

// What uninstalling the app's service from a coworker leaves behind: no account, no wake-ups.
export async function unbindAgent(scope: DbScope, workspaceId: number, agentId: string, slug: AppSlug): Promise<void> {
    await dropWakeTrigger(scope, workspaceId, agentId, slug)
    const { error } = await deleteRows(scope, 'app_connection_agents', { agent_id: agentId, app_slug: slug })
    if (error) throw new Error(error.message)
}
