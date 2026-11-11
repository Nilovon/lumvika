import type { Database } from '@/app/api/database.types'
import { callScalar, selectMaybeSingle, sql, updateRows, type DbScope } from '@/lib/db'
import { notifyWorkspace } from './notify'
import { appDefinition } from './registry'
import { APP_CONNECTION_COLUMNS, type AppSlug } from './types'

type ConnectionUpdate = Database['public']['Tables']['app_connections']['Update']

export type AppConnectionRow = Database['public']['Tables']['app_connections']['Row']

export const RATE_LIMIT_PAUSE_MS = 24 * 60 * 60_000

// Atomic and all-or-nothing across the windows: an invitation is refused without eating its day
// when its week is full. See claim_app_quota.
export async function claimQuota(scope: DbScope, quotaScope: string, action: string, periods: string[], maxes: number[], amount = 1): Promise<boolean> {
    // An array interpolated bare would be spread into a list of parameters: each one goes as one array.
    const { data, error } = await callScalar<boolean>(scope, 'claim_app_quota', {
        p_scope: quotaScope,
        p_action: action,
        p_periods: sql`${sql.param(periods)}::text[]`,
        p_maxes: sql`${sql.param(maxes)}::integer[]`,
        p_amount: amount,
    })
    if (error) throw new Error(error.message)
    return data === true
}

export function connectionScope(connectionId: string): string {
    return `connection:${connectionId}`
}

export function workspaceScope(workspaceId: number): string {
    return `workspace:${workspaceId}`
}

export async function updateConnection(scope: DbScope, connectionId: string, update: ConnectionUpdate): Promise<void> {
    const { error } = await updateRows(scope, 'app_connections', { ...update, updated_at: new Date().toISOString() }, { id: connectionId })
    if (error) throw new Error(error.message)
}

export type AgentConnection =
    | { ok: true; connection: Pick<AppConnectionRow, (typeof APP_CONNECTION_COLUMNS)[number]>; appStatus: string }
    | { ok: false; reason: 'not_attached' | 'not_found' }

// The account a coworker acts with, read fresh on every call: a coworker's binding, the app's
// status and the account's are all moved by other paths (a freeze, a disconnect) and the proxy is
// the one place that has to agree with them.
export async function agentConnection(scope: DbScope, agentId: string, slug: AppSlug): Promise<AgentConnection> {
    const { data: binding } = await selectMaybeSingle(scope, 'app_connection_agents', ['connection_id'] as const, { agent_id: agentId, app_slug: slug })
    if (!binding) return { ok: false, reason: 'not_attached' }
    const { data: connection } = await selectMaybeSingle(scope, 'app_connections', APP_CONNECTION_COLUMNS, { id: binding.connection_id })
    if (!connection) return { ok: false, reason: 'not_found' }
    const { data: app } = await selectMaybeSingle(scope, 'workspace_apps', ['status'] as const, { workspace_id: connection.workspace_id, app_slug: slug })
    return { ok: true, connection, appStatus: app?.status ?? 'uninstalled' }
}

// The provider itself said stop. The account rests a day, the workspace hears about it, and the pause
// lifts by itself on the first call after it ends.
export async function pauseForRateLimit(scope: DbScope, connection: { id: string; workspace_id: number; label: string | null }, slug: AppSlug): Promise<void> {
    await updateConnection(scope, connection.id, { status: 'paused', pause_reason: 'rate_limited', paused_until: new Date(Date.now() + RATE_LIMIT_PAUSE_MS).toISOString() })
    const app = appDefinition(slug)
    await notifyWorkspace(scope, connection.workspace_id, {
        appName: app.name,
        message: `${app.providerLabel} asked ${connection.label ?? 'one of your accounts'} to slow down. Your coworkers will not use it for 24 hours, so the account stays safe.`,
        copy: { key: 'rateLimited', values: { provider: app.providerLabel, account: connection.label ?? 'none' } },
        email: true,
    })
}

export async function markNeedsReconnect(scope: DbScope, connection: { id: string; workspace_id: number; label: string | null }, slug: AppSlug, reason: string): Promise<void> {
    await updateConnection(scope, connection.id, { status: 'needs_reconnect', pause_reason: reason, paused_until: null })
    const app = appDefinition(slug)
    await notifyWorkspace(scope, connection.workspace_id, {
        appName: app.name,
        message: `${app.providerLabel} signed ${connection.label ?? 'one of your accounts'} out. Reconnect it from Settings → Apps so your coworkers can use it again.`,
        copy: { key: 'signedOut', values: { provider: app.providerLabel, account: connection.label ?? 'none' } },
        email: true,
    })
}
