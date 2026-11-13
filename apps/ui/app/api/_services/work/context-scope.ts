import type { WorkAuthor } from '@lumvika/contracts'

import type { WorkspaceContext } from '@/app/api/_auth/ownership'
import type { WorkScope } from '@/app/api/_services/work/refs'

export function workScopeOf(ctx: Pick<WorkspaceContext, 'workspace' | 'scope'>): WorkScope {
    return { workspaceId: ctx.workspace.id, db: ctx.scope }
}

export function userAuthorOf(ctx: Pick<WorkspaceContext, 'userId'>): WorkAuthor {
    return { kind: 'user', userId: ctx.userId }
}
