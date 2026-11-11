import type { MemberProfile } from '@lumvika/contracts'

import type { WorkspaceContext, WorkspaceRole } from '@/app/api/_auth/ownership'
import { displayNameOf, readProfile } from '@/app/api/_services/me.service'
import { isAnonymousEmail } from '@/lib/auth/auth'
import { accountLabel } from '@/lib/auth/placeholder-email'
import type { AuthUser } from '@/lib/auth/session/getServerSession'
import { queryRows, selectAll, selectCount, selectMaybeSingle, sql, updateRows, type DbScope } from '@/lib/db'

type MemberIdentity = { email: string | null; name: string | null; avatarUrl: string | null }

type AuthUserRow = { id: string; email: string; name: string; image: string | null; is_anonymous: boolean }

// `auth.users` belongs to the auth layer and sits outside the row level security of `public`: the
// scope handed in has to be the service scope.
async function readAuthUsers(scope: DbScope, userIds: string[]): Promise<AuthUser[]> {
    if (userIds.length === 0) return []
    const ids = sql.join(
        userIds.map(id => sql`${id}`),
        sql`, `,
    )
    const { data } = await queryRows<AuthUserRow>(scope, sql`select id, email, name, image, is_anonymous from auth.users where id in (${ids})`)
    return (data ?? []).map(row => {
        const isAnonymous = row.is_anonymous || isAnonymousEmail(row.email)
        return { id: row.id, email: isAnonymous ? null : row.email, name: row.name, image: row.image, isAnonymous }
    })
}

export async function resolveMemberIdentities(scope: DbScope, userIds: string[]): Promise<Map<string, MemberIdentity>> {
    const users = await readAuthUsers(scope, userIds)
    return new Map(users.map(user => [user.id, { email: accountLabel(user.email?.toLowerCase()), name: displayNameOf(user), avatarUrl: readProfile(user).avatarUrl }]))
}

// Who signs a message in a conversation: every member of the workspace, with the name and photo of
// their auth record.
export async function listMemberProfiles({ workspace, scope }: WorkspaceContext): Promise<MemberProfile[]> {
    const { data: memberRows } = await selectAll(scope, 'workspace_members', ['user_id', 'role'] as const, { workspace_id: workspace.id }, { column: 'created_at', ascending: true })
    const rows = memberRows ?? []
    const identities = await resolveMemberIdentities(scope, rows.map(m => m.user_id))
    return rows.map(({ user_id: id, role }) => ({ id, name: identities.get(id)?.name ?? null, avatarUrl: identities.get(id)?.avatarUrl ?? null, role }))
}

export const LAST_ADMIN = 'The workspace needs at least one admin'

// Whether taking `userId` out of the admins (removal, demotion, departure) would leave the
// workspace with none. A member is never the last admin.
export async function isLastAdmin(scope: DbScope, workspaceId: number, userId: string): Promise<boolean> {
    const { data: target } = await selectMaybeSingle(scope, 'workspace_members', ['role'] as const, { workspace_id: workspaceId, user_id: userId })
    if (target?.role !== 'admin') return false
    const { data: admins } = await selectCount(scope, 'workspace_members', { workspace_id: workspaceId, role: 'admin' })
    return (admins ?? 0) <= 1
}

export async function setMemberRole(scope: DbScope, workspaceId: number, userId: string, role: WorkspaceRole): Promise<{ error: string | null }> {
    const { error } = await updateRows(scope, 'workspace_members', { role }, { workspace_id: workspaceId, user_id: userId })
    return { error: error?.message ?? null }
}

// Two admins stepping down at the same time both pass `isLastAdmin`, so the admins are counted
// again once the demotion is written: the one who finds none left takes the role back.
export async function demoteKeepingAnAdmin(scope: DbScope, workspaceId: number, userId: string): Promise<{ error: string | null }> {
    const { error } = await setMemberRole(scope, workspaceId, userId, 'member')
    if (error) return { error }
    const { data: admins } = await selectCount(scope, 'workspace_members', { workspace_id: workspaceId, role: 'admin' })
    if ((admins ?? 0) > 0) return { error: null }
    const { error: restoreError } = await setMemberRole(scope, workspaceId, userId, 'admin')
    return { error: restoreError ?? LAST_ADMIN }
}
