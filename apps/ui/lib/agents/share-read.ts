import { agentSharePreviewSchema, type AgentSharePreview } from '@lumvika/contracts'
import { isOpaqueToken } from '@/lib/opaque-token'
import { removePrivateFiles } from '@/lib/storage/private'
import { selectAll, selectMaybeSingle, updateRows, type DbScope } from '@/lib/db'
import { AGENT_SHARE_BUCKET, AGENT_SHARE_TOKEN_LENGTH, shareUrl } from './share-create'

// The card is read straight off the frozen `preview` jsonb, never off the source agent's row: a
// rename or a delete on the sender's side must not rewrite what was already sent.
export async function readAgentShare(scope: DbScope, token: string): Promise<AgentSharePreview | null> {
    // Checked before the query so an enumeration attempt costs nothing, and so a malformed token
    // and a revoked one are indistinguishable from outside.
    if (!isOpaqueToken(token, AGENT_SHARE_TOKEN_LENGTH)) return null

    const { data: share } = await selectMaybeSingle(scope, 'agent_shares', ['preview', 'revoked_at'] as const, { token })
    if (!share || share.revoked_at) return null

    const parsed = agentSharePreviewSchema.safeParse(share.preview)
    return parsed.success ? parsed.data : null
}

export type WorkspaceShare = {
    id: string
    url: string
    // The agent the link was made from, null once it has been deleted. The name beside it is the
    // one frozen at share time, so a rename since then does not rewrite what was sent.
    sourceAgentId: string | null
    agentName: string
    createdAt: string
    installCount: number
    include: { memories: boolean; database: boolean; files: boolean }
}

export async function listWorkspaceShares(scope: DbScope, workspaceId: number): Promise<WorkspaceShare[]> {
    const columns = ['id', 'token', 'source_agent_id', 'source_agent_name', 'created_at', 'install_count', 'include_memories', 'include_database', 'include_files'] as const
    const { data } = await selectAll(scope, 'agent_shares', columns, { workspace_id: workspaceId, revoked_at: { isNull: true } }, { column: 'created_at', ascending: false })

    return await Promise.all(
        (data ?? []).map(async row => ({
            id: row.id,
            url: await shareUrl(row.token),
            sourceAgentId: row.source_agent_id,
            agentName: row.source_agent_name,
            createdAt: row.created_at,
            installCount: row.install_count,
            include: { memories: row.include_memories, database: row.include_database, files: row.include_files },
        })),
    )
}

// Revoking has to remove the object too. A row flagged revoked while the tarball stays reachable
// to the service role is a flag, not a revocation, and the whole point of freezing a snapshot is
// that deleting it is the one way to take it back.
export async function revokeAgentShare(scope: DbScope, shareId: string, workspaceId: number): Promise<void> {
    const { data: share } = await selectMaybeSingle(scope, 'agent_shares', ['archive_path', 'workspace_id'] as const, { id: shareId })
    if (!share || share.workspace_id !== workspaceId) throw new Error('Share link not found')

    const { error } = await updateRows(scope, 'agent_shares', { revoked_at: new Date().toISOString(), archive_path: '' }, { id: shareId, workspace_id: workspaceId })
    if (error) throw new Error(error.message)

    if (share.archive_path) await removePrivateFiles(scope, AGENT_SHARE_BUCKET, [share.archive_path]).catch(() => {})
}
