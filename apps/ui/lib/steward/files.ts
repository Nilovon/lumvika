import 'server-only'

import type { WorkspaceContext } from '@/app/api/_auth/ownership'

export const STEWARD_FILES_BUCKET = 'steward-files'

// Ownership is structural: the key names the workspace, the member and the conversation, so a
// request can be checked against the caller alone, without reading steward_conversations.
export function stewardFileKey(ctx: Pick<WorkspaceContext, 'userId' | 'workspace'>, sessionId: string, path: string): string {
    return `${ctx.workspace.id}/${ctx.userId}/${sessionId}/${path}`
}
