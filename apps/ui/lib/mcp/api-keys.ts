import 'server-only'

import { isWorkspaceApiEntitled } from '@lumvika/cloud/billing'
import { queryRows, selectMaybeSingle, serviceScope, sql, updateRows } from '@/lib/db'
import { createHash, randomBytes } from 'node:crypto'

const KEY_PREFIX = 'rk_'
const KEY_BYTES = 30
const DISPLAY_PREFIX_LENGTH = 12
const ACTIVITY_STAMP_INTERVAL_MS = 60 * 60_000

const API_KEY_AUTH_COLUMNS = ['id', 'workspace_id', 'revoked_at', 'created_by_user_id', 'expires_at', 'scope', 'bound_agent_id'] as const

export type ApiKeyScope = 'account' | 'agent_import'

// `createdByUserId` is the member the key acts for: the key carries its creator's access (role and
// Boxes), and signs what goes through it, who sent a message, who wrote a schedule. Null for a key
// from before it was recorded, or one the back-office created: that key acts as the workspace.
// `boundAgentId` is the coworker an import key has created, and the only one it may touch after.
export type AuthenticatedApiKey = {
    keyId: string
    workspaceId: number
    createdByUserId: string | null
    scope: ApiKeyScope
    boundAgentId: string | null
}

// Base64url over random bytes: URL-safe, header-safe, no ambiguity about encoding.
export function generateApiKey(): string {
    return KEY_PREFIX + randomBytes(KEY_BYTES).toString('base64url')
}

// Only the hash is stored, so a database dump never yields a usable key.
export function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex')
}

// The fragment kept in clear so the admin list can tell two keys apart.
export function apiKeyPrefix(key: string): string {
    return key.slice(0, DISPLAY_PREFIX_LENGTH)
}

// A key in use is a human at work, which is what keeps a sandbox from being archived as idle.
// Throttled to one write an hour, like the heartbeat's, and as best-effort as the marker above.
async function stampSandboxActivity(workspaceId: number): Promise<void> {
    try {
        const staleBefore = new Date(Date.now() - ACTIVITY_STAMP_INTERVAL_MS).toISOString()
        await queryRows(
            serviceScope(),
            sql`update public.workspaces set last_active_at = ${new Date().toISOString()} where id = ${workspaceId} and is_sandbox = true and (last_active_at is null or last_active_at < ${staleBefore})`,
        )
    } catch {}
}

export async function authenticateApiKey(token: string): Promise<AuthenticatedApiKey | null> {
    if (!token.startsWith(KEY_PREFIX)) return null

    const service = serviceScope()
    const { data } = await selectMaybeSingle(service, 'api_keys', API_KEY_AUTH_COLUMNS, { key_hash: hashApiKey(token) })
    if (!data || data.revoked_at) return null
    if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) return null

    const { data: workspace } = await selectMaybeSingle(service, 'workspaces', ['subscription_status', 'is_sandbox'] as const, { id: data.workspace_id })
    if (!workspace || !isWorkspaceApiEntitled(workspace)) return null

    // Best-effort freshness marker: never let it fail or slow down the call it authenticates.
    updateRows(service, 'api_keys', { last_used_at: new Date().toISOString() }, { id: data.id }).then(
        () => undefined,
        () => undefined,
    )

    void stampSandboxActivity(data.workspace_id)

    return {
        keyId: data.id,
        workspaceId: data.workspace_id,
        createdByUserId: data.created_by_user_id,
        scope: data.scope === 'agent_import' ? 'agent_import' : 'account',
        boundAgentId: data.bound_agent_id,
    }
}

// Conditional on the key still being unbound, so of two create_agent racing on one import key
// only the first is kept: false tells the loser to undo the coworker it just created.
export async function bindImportKey(keyId: string, agentId: string): Promise<boolean> {
    const { data, error } = await updateRows(serviceScope(), 'api_keys', { bound_agent_id: agentId }, { id: keyId, scope: 'agent_import', bound_agent_id: { isNull: true } }, ['id'])
    if (error) throw new Error(error.message)
    return (data ?? []).length > 0
}
