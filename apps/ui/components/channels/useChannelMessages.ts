'use client'

import type { ChannelMessage, WorkAuthor, WorkMemberRef } from '@lumvika/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'

import { listChannelMessagesAction, postChannelMessageAction, type PostedChannelMessage } from '@/app/api/_actions/channels.actions'
import type { ChannelAgentTurn } from '@/app/api/_services/work/channel-coworkers.service'
import type { ChannelMessageView } from '@/app/api/_services/work/channels.service'
import { messageFromRow, refKey, turnFromRow } from '@/components/channels/channel-rows'
import { rememberCoworkers } from '@/components/channels/useChannelDirectory'
import { randomUuid } from '@/lib/random-uuid'
import { useRealtimeSubscription } from '@/supabase/useRealtimeSubscription'

export type SendState = 'sending' | 'failed'
// A message on screen: what the server holds, or one still on its way (`clientId` until it lands).
export type StreamMessage = ChannelMessageView & { sendState?: SendState; clientId?: string }
export type Draft = { body: string; mentions: WorkMemberRef[] }

const MAX_THREAD_AUTHORS = 3

export function optimisticMessage(channelId: string, author: WorkAuthor, draft: Draft, parentMessageId: string | null): StreamMessage {
    const clientId = `pending-${randomUuid()}`
    return { id: clientId, clientId, channelId, author, body: draft.body.trim(), parentMessageId, mentions: draft.mentions, editedAt: null, deletedAt: null, createdAt: new Date().toISOString(), thread: null, sendState: 'sending' }
}

// The server's copy replaces the optimistic one whichever arrives first: the action's answer or the
// realtime insert.
export function reconcile<T extends StreamMessage | ChannelMessage>(list: T[], landed: T): T[] {
    const at = list.findIndex(item => item.id === landed.id)
    if (at >= 0) return list.map((item, index) => (index === at ? { ...item, ...landed, sendState: undefined, clientId: undefined } : item))
    const pending = list.findIndex(item => 'clientId' in item && !!item.clientId && item.body === landed.body && refKey(item.author) === refKey(landed.author))
    if (pending >= 0) return list.map((item, index) => (index === pending ? { ...item, ...landed, sendState: undefined, clientId: undefined } : item))
    return [...list, landed].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function withReply(message: StreamMessage, reply: ChannelMessage): StreamMessage {
    const thread = message.thread ?? { replyCount: 0, lastReplyAt: reply.createdAt, replyAuthors: [] }
    const known = thread.replyAuthors.some(author => refKey(author) === refKey(reply.author))
    const replyAuthors = known || thread.replyAuthors.length >= MAX_THREAD_AUTHORS || reply.author.kind === 'system' ? thread.replyAuthors : [...thread.replyAuthors, reply.author]
    return { ...message, thread: { replyCount: thread.replyCount + 1, lastReplyAt: reply.createdAt, replyAuthors } }
}

export async function sendDraft(channelId: string, draft: Draft, parentMessageId: string | null): Promise<PostedChannelMessage | { error: { code?: string; error?: string } }> {
    const result = await postChannelMessageAction(channelId, { body: draft.body, mentions: draft.mentions, parentMessageId })
    if (!result.ok) return { error: result }
    rememberCoworkers(result.outsiders)
    return result
}

export type ChannelMessagesStatus = 'loading' | 'ready' | 'failed' | 'missing'

// The top-level messages of one channel, newest window first then older on demand, kept live; the
// coworker turns of the channel come with them.
export function useChannelMessages(channelId: string, me: WorkAuthor | null) {
    const [messages, setMessages] = useState<StreamMessage[]>([])
    const [turns, setTurns] = useState<ChannelAgentTurn[]>([])
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [status, setStatus] = useState<ChannelMessagesStatus>('loading')
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [activityAt, setActivityAt] = useState(0)
    const countedReplies = useRef(new Set<string>())

    const apply = useCallback((result: Awaited<ReturnType<typeof listChannelMessagesAction>>) => {
        if (!result.ok) {
            setStatus(result.code === 'channelNotFound' ? 'missing' : 'failed')
            return
        }
        rememberCoworkers(result.coworkers)
        countedReplies.current = new Set()
        setMessages(current => [...result.messages, ...current.filter(message => message.sendState && !message.parentMessageId)])
        setTurns(result.turns)
        setNextCursor(result.nextCursor)
        setStatus('ready')
    }, [])

    const load = useCallback(async () => apply(await listChannelMessagesAction(channelId)), [channelId, apply])

    // The screen keys this hook's owner by channel: a new channel starts from a fresh state.
    useEffect(() => {
        void listChannelMessagesAction(channelId).then(apply)
    }, [channelId, apply])

    const loadOlder = useCallback(async () => {
        if (!nextCursor || loadingOlder) return
        setLoadingOlder(true)
        const result = await listChannelMessagesAction(channelId, nextCursor)
        setLoadingOlder(false)
        if (!result.ok) return
        rememberCoworkers(result.coworkers)
        setMessages(current => [...result.messages.filter(older => !current.some(message => message.id === older.id)), ...current])
        setNextCursor(result.nextCursor)
    }, [channelId, nextCursor, loadingOlder])

    const filter = { column: 'channel_id', value: channelId }
    useRealtimeSubscription('channel_messages', {
        channelId: `channel-messages-${channelId}`,
        filter,
        onInsert: row => {
            const landed = messageFromRow(row)
            setActivityAt(Date.now())
            if (!landed.parentMessageId) return setMessages(current => reconcile(current, { ...landed, thread: null }))
            if (countedReplies.current.has(landed.id)) return
            countedReplies.current.add(landed.id)
            setMessages(current => current.map(message => (message.id === landed.parentMessageId ? withReply(message, landed) : message)))
        },
        onUpdate: row => {
            const changed = messageFromRow(row)
            setMessages(current => current.map(message => (message.id === changed.id ? { ...message, ...changed } : message)))
        },
        onResync: () => void load(),
    })
    useRealtimeSubscription('channel_agent_turns', {
        channelId: `channel-turns-${channelId}`,
        filter,
        onInsert: row => setTurns(current => [...current.filter(turn => turn.id !== row.id), turnFromRow(row)]),
        onUpdate: row => setTurns(current => current.map(turn => (turn.id === row.id ? turnFromRow(row) : turn))),
    })

    const deliver = useCallback(
        async (pending: StreamMessage, draft: Draft): Promise<PostedChannelMessage | null> => {
            const result = await sendDraft(channelId, draft, null)
            if ('error' in result) {
                setMessages(current => current.map(message => (message.clientId === pending.clientId ? { ...message, sendState: 'failed' } : message)))
                return null
            }
            setMessages(current => {
                const landedAlready = current.some(message => message.id === result.message.id)
                const rest = landedAlready ? current.filter(message => message.clientId !== pending.clientId) : current
                return reconcile(rest, { ...result.message, thread: null })
            })
            return result
        },
        [channelId]
    )

    const send = useCallback(
        async (draft: Draft): Promise<PostedChannelMessage | null> => {
            if (!me) return null
            const pending = optimisticMessage(channelId, me, draft, null)
            setMessages(current => [...current, pending])
            return deliver(pending, draft)
        },
        [channelId, me, deliver]
    )

    const retry = useCallback(
        async (clientId: string) => {
            const failed = messages.find(message => message.clientId === clientId)
            if (!failed) return
            setMessages(current => current.map(message => (message.clientId === clientId ? { ...message, sendState: 'sending' } : message)))
            await deliver(failed, { body: failed.body, mentions: failed.mentions })
        },
        [messages, deliver]
    )

    const discard = useCallback((clientId: string) => setMessages(current => current.filter(message => message.clientId !== clientId)), [])

    const replace = useCallback((changed: ChannelMessage) => setMessages(current => current.map(message => (message.id === changed.id ? { ...message, ...changed } : message))), [])

    return { messages, turns, status, nextCursor, loadingOlder, activityAt, loadOlder, send, retry, discard, replace, reload: load }
}
