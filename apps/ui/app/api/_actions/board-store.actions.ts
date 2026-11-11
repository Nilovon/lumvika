'use server'

import { z } from 'zod'

import { findIdleSessions } from '@/app/api/_services/chat.service'
import { getRequestScope } from '@/lib/auth/session/request'
import { fetchLiveSessions, sweepZombieSessions } from '@/lib/board/live-sessions'
import type { SpaceGrant } from '@/lib/board/box-access'
import type { SessionEntry, SpacePublic } from '@/lib/board/types'
import { deleteRows, inTransaction, selectMany, updateRows, type Tables } from '@/lib/db'
import { ATTENTION_STATUSES } from '@lumvika/contracts'
import { session_status } from '@lumvika/db/schema'

// The board store's reads and writes, made as the caller under row level security: the same rows
// and the same refusals the board had when it queried the database itself.

const MAX_IDS = 1000

const workspaceIdSchema = z.number().int().positive()
const idSchema = z.guid()
const idsSchema = z.array(idSchema).max(MAX_IDS)
const cellSchema = z.number().int()
const rectSchema = z.strictObject({ col_start: cellSchema, row_start: cellSchema, col_end: cellSchema, row_end: cellSchema })

const AGENT_COLUMNS = ['id', 'name', 'handle', 'description', 'template_id', 'status', 'col', 'row', 'workspace_id', 'space_id', 'created_at', 'disabled_at', 'disabled_reason'] as const
const SPACE_COLUMNS = ['id', 'workspace_id', 'name', 'col_start', 'row_start', 'col_end', 'row_end', 'created_at', 'visibility'] as const

type BoardAgentRow = Pick<Tables<'agents'>, (typeof AGENT_COLUMNS)[number]>

export type BoardSnapshot = { agents: BoardAgentRow[]; spaces: SpacePublic[]; grants: SpaceGrant[]; sessions: SessionEntry[] }

// Everything the board draws on load in one round trip: its agents, its Boxes, who manages which
// Box, and the sessions that carry a status.
export async function loadBoardAction(workspaceId: number): Promise<BoardSnapshot> {
    const parsed = workspaceIdSchema.safeParse(workspaceId)
    if (!parsed.success) return { agents: [], spaces: [], grants: [], sessions: [] }
    const scope = await getRequestScope()
    const [agents, spaces, grants] = await Promise.all([
        selectMany(scope, 'agents', AGENT_COLUMNS, { workspace_id: parsed.data }),
        selectMany(scope, 'spaces', SPACE_COLUMNS, { workspace_id: parsed.data }),
        selectMany(scope, 'space_members', ['space_id', 'user_id', 'access'] as const, { workspace_id: parsed.data }),
    ])
    const agentIds = (agents.data ?? []).map(agent => agent.id)
    const sessions = agentIds.length > 0 ? await fetchLiveSessions(scope, agentIds) : []
    return { agents: agents.data ?? [], spaces: spaces.data ?? [], grants: grants.data ?? [], sessions: sessions ?? [] }
}

// null when the read failed, so the board keeps what it holds rather than emptying itself.
export async function listLiveSessionsAction(agentIds: string[]): Promise<SessionEntry[] | null> {
    const parsed = idsSchema.safeParse(agentIds)
    if (!parsed.success) return null
    if (parsed.data.length === 0) return []
    return fetchLiveSessions(await getRequestScope(), parsed.data)
}

// The ids among these `working` sessions the engine confirmed have no run in flight, now flipped to idle.
export async function sweepZombieSessionsAction(workingSessionIds: string[]): Promise<string[]> {
    const parsed = idsSchema.safeParse(workingSessionIds)
    if (!parsed.success || parsed.data.length === 0) return []
    const working: SessionEntry[] = parsed.data.map(id => ({ id, agentId: '', originAgentId: null, status: 'working' }))
    return sweepZombieSessions(await getRequestScope(), working, ids => findIdleSessions(ids).catch(() => [])).catch(() => [])
}

const agentPositionSchema = z.strictObject({ agentId: idSchema, col: cellSchema, row: cellSchema, spaceId: idSchema.optional() })

// Without a Box, the agent keeps the one it is in. A row the policies hide counts as a refusal. The
// composite foreign key on (space_id, workspace_id) is what stops a crafted call from parking it in
// someone else's Box.
export async function setAgentPositionAction(input: z.input<typeof agentPositionSchema>): Promise<{ ok: boolean }> {
    const parsed = agentPositionSchema.safeParse(input)
    if (!parsed.success) return { ok: false }
    const { agentId, col, row, spaceId } = parsed.data
    const { data, error } = await updateRows(await getRequestScope(), 'agents', spaceId ? { col, row, space_id: spaceId } : { col, row }, { id: agentId }, ['id'])
    return { ok: !error && data.length === 1 }
}

export async function discardPlacingAgentAction(agentId: string): Promise<void> {
    const parsed = idSchema.safeParse(agentId)
    if (!parsed.success) return
    await deleteRows(await getRequestScope(), 'agents', { id: parsed.data })
}

export async function setSessionStatusAction(sessionId: string, status: string): Promise<void> {
    const parsed = z.object({ sessionId: idSchema, status: z.enum(session_status.enumValues) }).safeParse({ sessionId, status })
    if (!parsed.success) return
    await updateRows(await getRequestScope(), 'sessions', { status: parsed.data.status }, { id: parsed.data.sessionId })
}

// Only a session still waiting on the user is cleared: one that went back to `working` since the
// list was drawn belongs to its run, not to this acknowledgement.
export async function markSessionsHandledAction(sessionIds: string[]): Promise<void> {
    const parsed = idsSchema.safeParse(sessionIds)
    if (!parsed.success || parsed.data.length === 0) return
    await updateRows(await getRequestScope(), 'sessions', { status: 'idle' }, { id: parsed.data, status: [...ATTENTION_STATUSES] })
}

const spacePatchSchema = rectSchema.partial()

export async function updateSpaceRectAction(spaceId: string, patch: z.input<typeof spacePatchSchema>): Promise<void> {
    const parsed = z.object({ spaceId: idSchema, patch: spacePatchSchema }).safeParse({ spaceId, patch })
    if (!parsed.success || Object.keys(parsed.data.patch).length === 0) return
    await updateRows(await getRequestScope(), 'spaces', parsed.data.patch, { id: parsed.data.spaceId })
}

const moveSpaceSchema = z.strictObject({
    spaceId: idSchema,
    rect: rectSchema,
    carried: z.array(z.strictObject({ id: idSchema, col: cellSchema, row: cellSchema })).max(MAX_IDS),
})

// A Box and the agents drawn inside it move together or not at all.
export async function moveSpaceAction(input: z.input<typeof moveSpaceSchema>): Promise<{ ok: boolean }> {
    const parsed = moveSpaceSchema.safeParse(input)
    if (!parsed.success) return { ok: false }
    const { spaceId, rect, carried } = parsed.data
    const scope = await getRequestScope()
    try {
        await inTransaction(scope, async tx => {
            const moved = await updateRows(tx, 'spaces', rect, { id: spaceId }, ['id'])
            if (moved.error || moved.data.length !== 1) throw new Error(moved.error?.message ?? 'Box not moved')
            for (const agent of carried) {
                const { data, error } = await updateRows(tx, 'agents', { col: agent.col, row: agent.row }, { id: agent.id }, ['id'])
                if (error || data.length !== 1) throw new Error(error?.message ?? 'Agent not moved')
            }
        })
        return { ok: true }
    } catch {
        return { ok: false }
    }
}
