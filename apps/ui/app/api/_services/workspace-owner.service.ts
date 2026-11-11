import { earliestAdminFirst } from '@/app/api/_auth/ownership'
import { isAnonymousEmail } from '@/lib/auth/auth'
import { queryRows, selectMany, selectMaybeSingle, serviceScope, sql, type DbScope } from '@/lib/db'

export type WorkspaceOwner = { userId: string; email: string }

// An anonymous account carries a placeholder address nobody reads: it answers as no email at all.
async function loginEmailOf(scope: DbScope, userId: string): Promise<string | null> {
    const { data } = await queryRows<{ email: string }>(scope, sql`select email from auth.users where id = ${userId}`)
    const email = data?.[0]?.email
    return email && !isAnonymousEmail(email) ? email : null
}

// The owner's login email is the PostHog distinct_id (matches posthog.identify), so webhook-side
// events attach to the same person. Ignores email prefs — this is analytics identity, not a mailing.
export async function resolveWorkspaceOwner(workspaceId: number): Promise<WorkspaceOwner | null> {
    const scope = serviceScope()
    const { data: members } = await selectMany(scope, 'workspace_members', ['user_id', 'role'] as const, { workspace_id: workspaceId }, { column: 'created_at' })
    const owner = earliestAdminFirst(members ?? [])
    if (!owner) return null
    const email = await loginEmailOf(scope, owner.user_id)
    return email ? { userId: owner.user_id, email } : null
}

// The member who started a run, when the engine names one. Checked against the workspace so an
// engine cannot attribute its runs to someone outside it.
export async function resolveWorkspaceMemberEmail(workspaceId: number, userId: string): Promise<string | null> {
    const scope = serviceScope()
    const { data: member } = await selectMaybeSingle(scope, 'workspace_members', ['user_id'] as const, { workspace_id: workspaceId, user_id: userId })
    if (!member) return null
    return loginEmailOf(scope, member.user_id)
}
