'use server'

import { z } from 'zod'

import { getRequestScope } from '@/lib/auth/session/request'
import { selectMany, selectMaybeSingle } from '@/lib/db'

// What the session provider of the browser reads about the caller, as the caller under row level
// security: their own `users` row, the workspaces they belong to, and their place in one of them.

const workspaceIdSchema = z.number().int().positive()

const SESSION_USER_COLUMNS = ['id', 'created_at', 'workspace_id', 'email_notification_prefs', 'account_role', 'expert_profile_id', 'signed_up_at', 'locale'] as const

const SESSION_WORKSPACE_COLUMNS = [
    'id',
    'name',
    'icon_url',
    'created_at',
    'plan',
    'stripe_customer_id',
    'max_agents',
    'max_seats',
    'model_access',
    'custom_integrations',
    'subscription_status',
    'current_period_end',
    'trial_ends_at',
    'lumvika_used_micros',
    'lumvika_budget_micros',
    'lumvika_topup_micros',
    'lumvika_period_anchor',
    'lumvika_credit_paused_at',
    'is_sandbox',
    'boxes_disabled_at',
    'boxes_archived_at',
    'onboarded_at',
    'price_arm',
    'locale',
] as const

export async function readSessionUserAction() {
    const scope = await getRequestScope()
    if (!scope.userId) return null
    const { data } = await selectMaybeSingle(scope, 'users', SESSION_USER_COLUMNS, { id: scope.userId })
    return data
}

export async function readSignupStampAction(): Promise<string | null> {
    const scope = await getRequestScope()
    if (!scope.userId) return null
    const { data } = await selectMaybeSingle(scope, 'users', ['signed_up_at'] as const, { id: scope.userId })
    return data?.signed_up_at ?? null
}

export async function isWorkspaceMemberAction(workspaceId: number): Promise<boolean> {
    const parsed = workspaceIdSchema.safeParse(workspaceId)
    const scope = await getRequestScope()
    if (!parsed.success || !scope.userId) return false
    const { data } = await selectMaybeSingle(scope, 'workspace_members', ['workspace_id'] as const, { user_id: scope.userId, workspace_id: parsed.data })
    return !!data
}

export async function readWorkspaceAction(workspaceId: number) {
    const parsed = workspaceIdSchema.safeParse(workspaceId)
    if (!parsed.success) return null
    const { data } = await selectMaybeSingle(await getRequestScope(), 'workspaces', SESSION_WORKSPACE_COLUMNS, { id: parsed.data })
    return data
}

// `ids` holds every membership, `workspaces` the rows of those the caller may read.
export async function readMemberWorkspacesAction() {
    const scope = await getRequestScope()
    if (!scope.userId) return { ids: [] as number[], workspaces: [] }
    const { data: memberships } = await selectMany(scope, 'workspace_members', ['workspace_id'] as const, { user_id: scope.userId })
    const ids = (memberships ?? []).map(membership => membership.workspace_id)
    if (ids.length === 0) return { ids, workspaces: [] }
    const { data: workspaces } = await selectMany(scope, 'workspaces', SESSION_WORKSPACE_COLUMNS, { id: ids })
    return { ids, workspaces: workspaces ?? [] }
}

export async function readWorkspaceRoleAction(workspaceId: number) {
    const parsed = workspaceIdSchema.safeParse(workspaceId)
    const scope = await getRequestScope()
    if (!parsed.success || !scope.userId) return null
    const { data } = await selectMaybeSingle(scope, 'workspace_members', ['role', 'box_scope'] as const, { user_id: scope.userId, workspace_id: parsed.data })
    return data
}

export async function readWorkspaceAnswersAction(workspaceId: number) {
    const parsed = workspaceIdSchema.safeParse(workspaceId)
    if (!parsed.success) return null
    const { data } = await selectMaybeSingle(await getRequestScope(), 'workspace_onboarding', ['answers'] as const, { workspace_id: parsed.data })
    return data?.answers ?? null
}
