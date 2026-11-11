import 'server-only'
import { authAccounts, authSessions, authUsers } from '@lumvika/db/schema'
import { listObjects, removeObjects } from '@lumvika/storage'

import { stopWorkspaceCharges, subscriptionStillCharges, uninstallWorkspaceApps } from '@lumvika/cloud/account'
import type { AccountDeletionBlocker } from '@/lib/auth/account-deletion'
import { deletedAccountEmailFor } from '@/lib/auth/placeholder-email'
import { DEFAULT_WORKSPACE_NAME } from '@/lib/naming/workspace-name'
import { isLastAdmin, setMemberRole } from '@/app/api/_services/members.service'
import { deleteRows, eq, inTransaction, selectAll, selectMany, updateRows, type DbScope } from '@/lib/db'

export const ACCOUNT_DELETED_REASON = 'account_deleted'

const WORKSPACE_COLUMNS = ['id', 'name', 'is_sandbox', 'stripe_customer_id', 'stripe_subscription_id', 'subscription_status'] as const
const LIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing'])

type OwnWorkspace = { id: number; name: string; isSandbox: boolean; stripeCustomerId: string | null; stripeSubscriptionId: string | null; subscriptionStatus: string | null; shared: boolean }

async function workspacesOf(admin: DbScope, userId: string): Promise<OwnWorkspace[]> {
    const { data: memberships, error } = await selectAll(admin, 'workspace_members', ['workspace_id'] as const, { user_id: userId })
    if (error) throw new Error(error.message)
    const ids = memberships.map(membership => membership.workspace_id)
    if (ids.length === 0) return []

    const [{ data: workspaces, error: workspacesError }, { data: members, error: membersError }] = await Promise.all([selectAll(admin, 'workspaces', WORKSPACE_COLUMNS, { id: ids }), selectAll(admin, 'workspace_members', ['workspace_id', 'user_id'] as const, { workspace_id: ids })])
    if (workspacesError) throw new Error(workspacesError.message)
    if (membersError) throw new Error(membersError.message)

    return workspaces.map(workspace => ({
        id: workspace.id,
        name: workspace.name ?? DEFAULT_WORKSPACE_NAME,
        isSandbox: workspace.is_sandbox,
        stripeCustomerId: workspace.stripe_customer_id,
        stripeSubscriptionId: workspace.stripe_subscription_id,
        subscriptionStatus: workspace.subscription_status,
        shared: members.some(member => member.workspace_id === workspace.id && member.user_id !== userId),
    }))
}

// The workspaces only this user is left in, whose subscription has to be cancelled through the
// billing flow before the account can go. Shared workspaces carry on with their other members.
async function blockersAmong(workspaces: OwnWorkspace[]): Promise<AccountDeletionBlocker[]> {
    const candidates = workspaces.filter(workspace => !workspace.shared && workspace.stripeSubscriptionId && LIVE_SUBSCRIPTION_STATUSES.has(workspace.subscriptionStatus ?? ''))
    const charging = await Promise.all(candidates.map(workspace => subscriptionStillCharges(workspace.stripeSubscriptionId!)))
    return candidates.filter((_, index) => charging[index]).map(workspace => ({ workspaceId: workspace.id, name: workspace.name }))
}

export async function accountDeletionBlockers(admin: DbScope, userId: string): Promise<AccountDeletionBlocker[]> {
    return blockersAmong(await workspacesOf(admin, userId))
}

// The last admin leaving hands the workspace to the earliest member, so it is never left with no one
// who can pay for it or let anyone in.
async function leaveSharedWorkspace(admin: DbScope, userId: string, workspace: OwnWorkspace) {
    if (await isLastAdmin(admin, workspace.id, userId)) {
        const { data: members } = await selectMany(admin, 'workspace_members', ['user_id'] as const, { workspace_id: workspace.id, user_id: { neq: userId } }, { column: 'created_at' }, 1)
        const heir = members?.[0]
        if (heir) {
            const { error } = await setMemberRole(admin, workspace.id, heir.user_id, 'admin')
            if (error) throw new Error(error)
        }
    }
    const { error } = await deleteRows(admin, 'workspace_members', { workspace_id: workspace.id, user_id: userId })
    if (error) throw new Error(error.message)
}

// The workspace, its agents and its Boxes stay, with the membership that ties them to the
// anonymized user: they are what a bug report is traced back through. Only what costs or runs goes.
async function shutDownOwnWorkspace(admin: DbScope, workspace: OwnWorkspace) {
    await stopWorkspaceCharges(admin, workspace)

    if (!workspace.isSandbox) {
        const { error } = await updateRows(admin, 'workspaces', { boxes_deleted_at: new Date().toISOString() }, { id: workspace.id })
        if (error) throw new Error(error.message)
    }

    const { error } = await updateRows(admin, 'agents', { disabled_at: new Date().toISOString(), disabled_reason: ACCOUNT_DELETED_REASON }, { workspace_id: workspace.id, disabled_at: { isNull: true } })
    if (error) throw new Error(error.message)

    await uninstallWorkspaceApps(admin, workspace.id)
}

async function erasePersonalData(admin: DbScope, userId: string) {
    const deletions = await Promise.all([
        deleteRows(admin, 'user_presence', { user_id: userId }),
        updateRows(admin, 'newsletter_recipients', { email: deletedAccountEmailFor(userId) }, { user_id: userId }),
    ])
    const failed = deletions.find(result => result.error)
    if (failed?.error) throw new Error(failed.error.message)

    const avatars = await listObjects('user-avatars', userId)
    if (avatars.error) throw new Error(avatars.error.message)
    const paths = avatars.data.map(file => `${userId}/${file.name}`)
    if (paths.length > 0) {
        const { error } = await removeObjects('user-avatars', paths)
        if (error) throw new Error(error.message)
    }

    const { error } = await updateRows(admin, 'users', { deleted_at: new Date().toISOString(), onboarding_answers: null }, { id: userId })
    if (error) throw new Error(error.message)
}

// The auth row stays, for the rows that reference it, filed under a dead address with no name, no
// photo, no provider and no session: no code can reach it and nothing else opens it.
async function anonymizeAuthUser(admin: DbScope, userId: string) {
    await inTransaction(admin, scope =>
        scope.run(async db => {
            await db.delete(authSessions).where(eq(authSessions.userId, userId))
            await db.delete(authAccounts).where(eq(authAccounts.userId, userId))
            await db.update(authUsers).set({ email: deletedAccountEmailFor(userId), name: '', image: null, emailVerified: false, updatedAt: new Date() }).where(eq(authUsers.id, userId))
        })
    )
}

/**
 * Deletes an account the way Lumvika does: the rows stay, nothing in them points to the person any
 * more, and nobody can sign into them again. Every step can run twice, and the auth row goes last,
 * so a failure halfway leaves a session the user can retry from.
 */
export async function anonymizeAccount(admin: DbScope, userId: string): Promise<{ ok: true } | { ok: false; blockers: AccountDeletionBlocker[] }> {
    const workspaces = await workspacesOf(admin, userId)
    const blockers = await blockersAmong(workspaces)
    if (blockers.length > 0) return { ok: false, blockers }

    for (const workspace of workspaces) {
        if (workspace.shared) await leaveSharedWorkspace(admin, userId, workspace)
        else await shutDownOwnWorkspace(admin, workspace)
    }

    await erasePersonalData(admin, userId)
    await anonymizeAuthUser(admin, userId)
    return { ok: true }
}
