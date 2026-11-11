import 'server-only'
import type { Json } from '@/app/api/database.types'
import type { McpTokenBundle } from '@/lib/engine/client'
import { deleteRows, insertRows, selectMaybeSingle, serviceScope, updateRows } from '@/lib/db'
import { GRANT_TTL_MS, type CallbackGrant, type ConnectTicket } from './mobile-ticket'

// What the callback leaves for the app to finish with: the engine never hears from the callback itself.
// A managed token carries no client secret, nor does an MCP token for a pre-registered client: the
// claim reads the provider's from the environment again. `mcpUrl` names that client, rows parked by
// a hub predating it have none.
export type ParkedSignIn =
    | { kind: 'mcp'; serverName: string; mcpUrl?: string; token: McpTokenBundle }
    | { kind: 'managed'; key: string; provider: string; serverName: string; token: Pick<McpTokenBundle, 'accessToken' | 'refreshToken' | 'expiresAt' | 'scope'>; email?: string }
    | { kind: 'composio'; key: string; connectedAccountId: string }

const PENDING_COLUMNS = ['jti', 'agent_id', 'workspace_id', 'user_id', 'payload', 'expires_at'] as const

export const SIGN_IN_ALREADY_USED = 'This sign-in link was already used, please retry'
export const SIGN_IN_EXPIRED = 'Sign-in expired, please retry'

export class SignInClaimError extends Error {}

// The ticket is spent as the sign-in starts: a second start on the same ticket finds its row.
export async function openPendingGrant(ticket: ConnectTicket): Promise<void> {
    const service = serviceScope()
    await deleteRows(service, 'oauth_pending_grants', { expires_at: { lt: new Date().toISOString() } })
    const { error } = await insertRows(service, 'oauth_pending_grants', {
        jti: ticket.jti,
        agent_id: ticket.agentId,
        workspace_id: ticket.workspaceId,
        user_id: ticket.userId,
        expires_at: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
    })
    if (error?.code === '23505') throw new Error(SIGN_IN_ALREADY_USED)
    if (error) throw new Error(error.message)
}

// Only the row the start opened, still empty and still alive, takes what the provider handed over.
export async function parkSignIn(grant: CallbackGrant, parked: ParkedSignIn): Promise<void> {
    const { data, error } = await updateRows(
        serviceScope(),
        'oauth_pending_grants',
        { kind: parked.kind, payload: parked as unknown as Json },
        { jti: grant.jti, agent_id: grant.agentId, payload: { isNull: true }, expires_at: { gt: new Date().toISOString() } },
        ['jti'],
    )
    if (error) throw new Error(error.message)
    if (!data?.length) throw new Error(SIGN_IN_EXPIRED)
}

// The app claims with the bearer of the person who started the sign-in, in the workspace the ticket
// named. The row is spent either way: a claim by anyone else burns it.
export async function claimSignIn(jti: string, claimant: { agentId: string; workspaceId: number; userId: string }): Promise<ParkedSignIn> {
    const service = serviceScope()
    const { data: row, error } = await selectMaybeSingle(service, 'oauth_pending_grants', PENDING_COLUMNS, { jti })
    if (error) throw new Error(error.message)
    if (!row) throw new SignInClaimError(SIGN_IN_EXPIRED)
    await deleteRows(service, 'oauth_pending_grants', { jti })
    const theirs = row.agent_id === claimant.agentId && row.workspace_id === claimant.workspaceId && row.user_id === claimant.userId
    if (!theirs || row.payload === null || new Date(row.expires_at).getTime() < Date.now()) throw new SignInClaimError(SIGN_IN_EXPIRED)
    return row.payload as unknown as ParkedSignIn
}
