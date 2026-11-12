import { workMemberRefSchema, type ChannelMessage, type WorkAuthor, type WorkMemberRef } from '@lumvika/contracts'

import type { ChannelAgentTurn } from '@/app/api/_services/work/channel-coworkers.service'
import type { Tables } from '@/app/api/database.types'

// The rows realtime hands over, read the way the server's mappers read them.

function authorOf(userId: string | null, agentId: string | null): WorkAuthor {
    if (userId) return { kind: 'user', userId }
    if (agentId) return { kind: 'agent', agentId }
    return { kind: 'system' }
}

function mentionsOf(value: unknown): WorkMemberRef[] {
    if (!Array.isArray(value)) return []
    return value.flatMap(entry => {
        const parsed = workMemberRefSchema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
    })
}

export function messageFromRow(row: Tables<'channel_messages'>): ChannelMessage {
    return {
        id: row.id,
        channelId: row.channel_id,
        author: authorOf(row.author_user_id, row.author_agent_id),
        body: row.deleted_at ? '' : row.body,
        parentMessageId: row.parent_message_id,
        mentions: row.deleted_at ? [] : mentionsOf(row.mentions),
        editedAt: row.edited_at,
        deletedAt: row.deleted_at,
        createdAt: row.created_at,
    }
}

const TURN_FAILURES = new Set<string>(['engine_unreachable', 'engine_outdated', 'coworker_disabled', 'no_model', 'no_access', 'not_member', 'timeout', 'failed'])

export function turnFromRow(row: Tables<'channel_agent_turns'>): ChannelAgentTurn {
    return {
        id: row.id,
        channelId: row.channel_id,
        agentId: row.agent_id,
        threadMessageId: row.thread_message_id,
        triggerMessageId: row.trigger_message_id,
        status: row.status === 'answered' || row.status === 'failed' ? row.status : 'answering',
        failure: row.failure ? ((TURN_FAILURES.has(row.failure) ? row.failure : 'failed') as ChannelAgentTurn['failure']) : null,
        replyMessageId: row.reply_message_id,
        createdAt: row.created_at,
        finishedAt: row.finished_at,
    }
}

// The server closes a turn its request lost after this long; until then the screen stops showing it.
const STALE_TURN_MS = 15 * 60_000

export function isAnswering(turn: ChannelAgentTurn, now = Date.now()): boolean {
    return turn.status === 'answering' && now - new Date(turn.createdAt).getTime() < STALE_TURN_MS
}

export function sameRef(a: WorkAuthor, b: WorkAuthor): boolean {
    if (a.kind === 'user' && b.kind === 'user') return a.userId === b.userId
    if (a.kind === 'agent' && b.kind === 'agent') return a.agentId === b.agentId
    return a.kind === 'system' && b.kind === 'system'
}

export function refKey(ref: WorkAuthor): string {
    if (ref.kind === 'user') return `user:${ref.userId}`
    if (ref.kind === 'agent') return `agent:${ref.agentId}`
    return 'system'
}
