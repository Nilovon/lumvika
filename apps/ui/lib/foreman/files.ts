import 'server-only'

import type { WorkspaceContext } from '@/app/api/_auth/ownership'

export const FOREMAN_FILES_BUCKET = 'foreman-files'

// Ownership is structural: the key names the workspace, the member and the conversation, so a
// request can be checked against the caller alone, without reading foreman_conversations.
export function foremanFileKey(ctx: Pick<WorkspaceContext, 'userId' | 'workspace'>, sessionId: string, path: string): string {
    return `${ctx.workspace.id}/${ctx.userId}/${sessionId}/${path}`
}
