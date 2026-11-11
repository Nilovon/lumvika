import 'server-only'
import type { Enums } from '@/lib/db'
import { isAnonymousEmail } from '@/lib/auth/auth'
import { selectMaybeSingle, selectSingle } from '@/lib/db'
import { cache } from 'react'
import { getRequestAuth, getRequestScope, getRequestWorkspaceId } from './request'

// The person behind the request as the auth layer knows them. `email` is null for an anonymous visitor.
export type AuthUser = { id: string; email: string | null; name: string; image: string | null; isAnonymous: boolean }

export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
    const auth = await getRequestAuth()
    if (!auth) return null
    const { id, email, name, image, isAnonymous } = auth.user as typeof auth.user & { isAnonymous?: boolean | null }
    const anonymous = !!isAnonymous || isAnonymousEmail(email)
    return { id, email: anonymous ? null : email, name, image: image ?? null, isAnonymous: anonymous }
})

// The caller's user row and the workspace it acts in, nothing more: one read under row level
// security, which only returns the caller's own row. The guards that only need a workspace id stop here.
export const getSessionWorkspace = cache(async () => {
    const scope = await getRequestScope()
    const { data: storedUser } = scope.userId ? await selectMaybeSingle(scope, 'users', ['id', 'workspace_id', 'email_notification_prefs', 'locale'] as const, { id: scope.userId }) : { data: null }
    const requestedWorkspaceId = await getRequestWorkspaceId()

    // The workspace, named by the request or stored on the row, only stands once the caller's own
    // membership proves it: a membership can be revoked after the row was written. Refused, the
    // session carries neither user nor workspace, so every caller fails closed.
    let workspaceRefused = false
    let user = storedUser
    let membership: { role: Enums<'workspace_role'>; box_scope: string } | null = null
    if (storedUser) {
        const workspaceId = requestedWorkspaceId ?? storedUser.workspace_id
        const { data: row } = Number.isNaN(workspaceId) ? { data: null } : await selectMaybeSingle(scope, 'workspace_members', ['workspace_id', 'role', 'box_scope'] as const, { user_id: storedUser.id, workspace_id: workspaceId })
        membership = row ? { role: row.role, box_scope: row.box_scope } : null
        workspaceRefused = !row
        user = row ? { ...storedUser, workspace_id: workspaceId } : null
    }

    return { scope, user, workspaceRefused, membership }
})

export const getServerSession = cache(async () => {
    const { scope, user, workspaceRefused } = await getSessionWorkspace()

    const [{ data: workspace }, authUser] = await Promise.all([
        !workspaceRefused && user
            ? selectSingle(scope, 'workspaces', ['id', 'name', 'icon_url', 'plan', 'max_agents', 'max_seats', 'model_access', 'custom_integrations', 'subscription_status', 'current_period_end', 'trial_ends_at', 'is_sandbox', 'onboarded_at', 'price_arm', 'locale'] as const, { id: user.workspace_id })
            : Promise.resolve({ data: null }),
        getAuthUser(),
    ])

    return { user, workspace, workspaceRefused, session: authUser, isAnonymous: authUser?.isAnonymous ?? false }
})
