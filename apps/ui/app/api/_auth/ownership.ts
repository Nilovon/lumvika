import { toBoxScope, type BoxScope } from '@/app/api/_auth/box-scope'
import { AuthorizationError, UnauthenticatedError } from '@/app/api/_auth/errors'
import { realEmail } from '@/lib/auth/placeholder-email'
import type { Enums } from '@/app/api/database.types'
import { getServerSession, getSessionWorkspace, type AuthUser } from '@/lib/auth/session/getServerSession'
import { selectMany, selectMaybeSingle, selectSingle, serviceScope, type DbScope } from '@/lib/db'
import type { ErrorCode } from '@/lib/i18n/action-error'

// Why this module exists: every mutation/read in the API goes through the
// service scope (serviceScope), which BYPASSES Row Level Security. RLS therefore
// protects queries run as the caller but not this path. These helpers re-establish object-level authorization in code: they
// resolve the caller's workspace from the auth session (never trusting an id
// passed by the client) and assert the target resource belongs to it.

export { AuthorizationError, UnauthenticatedError } from '@/app/api/_auth/errors'

const NOT_A_MEMBER = 'notMember' satisfies ErrorCode

export type WorkspaceRole = Enums<'workspace_role'>

export { toBoxScope, type BoxScope } from '@/app/api/_auth/box-scope'

// The signed-in user's workspace, read under row level security as the caller
// (getSessionWorkspace), so it can't be spoofed by the request body. Throws when
// there is no authenticated user.
export async function requireWorkspaceId(): Promise<number> {
    const { user, workspaceRefused } = await getSessionWorkspace()
    if (workspaceRefused) throw new AuthorizationError(NOT_A_MEMBER)
    if (!user?.workspace_id) throw new UnauthenticatedError()
    return user.workspace_id
}

export type WorkspaceContext = {
    userId: string
    userEmail: string | null
    authUser: AuthUser
    workspace: NonNullable<Awaited<ReturnType<typeof getServerSession>>['workspace']>
    role: WorkspaceRole
    boxScope: BoxScope
    scope: DbScope
}

// The same resolution as requireWorkspaceId, one step further: it also proves membership and
// hands back the row and the service scope the caller is about to need. A workspace can
// stay on users.workspace_id after the membership is gone, so the membership is re-read rather
// than inferred from the session.
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
    const { user, workspace, session, workspaceRefused } = await getServerSession()
    if (workspaceRefused) throw new AuthorizationError(NOT_A_MEMBER)
    if (!user?.id || !user.workspace_id || !workspace || !session) throw new UnauthenticatedError()

    const scope = serviceScope()
    const { data: membership } = await selectMaybeSingle(scope, 'workspace_members', ['role', 'box_scope'] as const, { user_id: user.id, workspace_id: workspace.id })
    if (!membership) throw new AuthorizationError(NOT_A_MEMBER)

    return { userId: user.id, userEmail: realEmail(session.email), authUser: session, workspace, role: membership.role, boxScope: toBoxScope(membership.box_scope), scope }
}

export const ADMIN_ONLY = 'adminOnly' satisfies ErrorCode

export async function requireAdminContext(code: ErrorCode = ADMIN_ONLY): Promise<WorkspaceContext> {
    const ctx = await requireWorkspaceContext()
    if (ctx.role !== 'admin') throw new AuthorizationError(code)
    return ctx
}

type OwnedSpace = { workspace_id: number }

// The workspace comes in explicitly for the callers that proved their identity with an API key
// rather than a browser session; the session variant below is the same check, one line thinner.
export async function assertSpaceOwnedBy(workspaceId: number, spaceId: string): Promise<OwnedSpace> {
    const { data: space } = await selectSingle(serviceScope(), 'spaces', ['workspace_id'] as const, { id: spaceId })
    if (!space || space.workspace_id !== workspaceId) throw new AuthorizationError('spaceNotFound')
    return space
}

export async function assertSpaceInWorkspace(spaceId: string): Promise<OwnedSpace> {
    return assertSpaceOwnedBy(await requireWorkspaceId(), spaceId)
}

// Some things need one person to stand for the workspace: the account an API key acts as, the
// recipient of billing mail. That is the earliest admin, the account everything already hangs off,
// or the earliest member should no admin be left. Answers null so each caller writes its own refusal.
export async function workspaceFounderUserId(workspaceId: number): Promise<string | null> {
    const { data: members } = await selectMany(serviceScope(), 'workspace_members', ['user_id', 'role'] as const, { workspace_id: workspaceId }, { column: 'created_at' })
    return earliestAdminFirst(members ?? [])?.user_id ?? null
}

export function earliestAdminFirst<T extends { role: WorkspaceRole }>(membersByAge: T[]): T | undefined {
    return membersByAge.find(m => m.role === 'admin') ?? membersByAge[0]
}
