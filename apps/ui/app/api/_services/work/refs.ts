import type { WorkAuthor, WorkMemberRef } from '@lumvika/contracts'
import type { z } from 'zod'

import { assertAgentAccess, type Actor } from '@/app/api/_auth/access'
import { AppError, isErrorCode } from '@/lib/i18n/action-error'
import { selectMaybeSingle, serviceScope, type DbScope } from '@/lib/db'

// Every work service is called with the workspace it writes in and, for a test or a caller inside a
// transaction, the scope to run as (the service scope by default). Services scope every read and
// write to the workspace and nothing more: the caller asserts access first with the guards of
// `_auth/project-access.ts`.
export type WorkScope = { workspaceId: number; db?: DbScope }

export function dbOf(scope: WorkScope): DbScope {
    return scope.db ?? serviceScope()
}

export function memberRefOf(userId: string | null, agentId: string | null): WorkMemberRef | null {
    if (userId) return { kind: 'user', userId }
    if (agentId) return { kind: 'agent', agentId }
    return null
}

export function authorOf(userId: string | null, agentId: string | null): WorkAuthor {
    return memberRefOf(userId, agentId) ?? { kind: 'system' }
}

export function authorColumns(author: WorkAuthor | WorkMemberRef | null): { userId: string | null; agentId: string | null } {
    if (author?.kind === 'user') return { userId: author.userId, agentId: null }
    if (author?.kind === 'agent') return { userId: null, agentId: author.agentId }
    return { userId: null, agentId: null }
}

export function sameMember(a: WorkMemberRef | null, b: WorkMemberRef | null): boolean {
    if (!a || !b) return a === b
    if (a.kind === 'user' && b.kind === 'user') return a.userId === b.userId
    if (a.kind === 'agent' && b.kind === 'agent') return a.agentId === b.agentId
    return false
}

// A person must be a member of the workspace, an agent one of its agents.
export async function assertMemberInWorkspace(scope: WorkScope, ref: WorkMemberRef): Promise<void> {
    const db = dbOf(scope)
    const found =
        ref.kind === 'user'
            ? (await selectMaybeSingle(db, 'workspace_members', ['user_id'] as const, { user_id: ref.userId, workspace_id: scope.workspaceId })).data
            : (await selectMaybeSingle(db, 'agents', ['id'] as const, { id: ref.agentId, workspace_id: scope.workspaceId })).data
    if (!found) throw new AppError('assigneeNotInWorkspace')
}

// A person hands work only to a coworker they may use: one in a Box closed to them answers like a
// coworker that does not exist, so nothing about it is revealed. The workspace itself reaches every Box.
export async function assertAssignableBy(actor: Actor, ref: WorkMemberRef | null | undefined): Promise<void> {
    if (ref?.kind === 'agent') await assertAgentAccess(ref.agentId, 'use', actor)
}

// Input reaches a service from a server action, a hub tool or a route: it is checked here once, and
// a refusal comes back as the `errors` code the schema names.
export function parseWorkInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
    const parsed = schema.safeParse(input)
    if (parsed.success) return parsed.data
    const code = parsed.error.issues.map(issue => issue.message).find(isErrorCode)
    throw new AppError(code ?? 'invalidInput')
}
