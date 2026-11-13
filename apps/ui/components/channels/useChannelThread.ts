'use client'

import type { ChannelMessage, WorkAuthor } from '@lumvika/contracts'
import { useCallback, useEffect, useState } from 'react'

import { getChannelThreadAction, type PostedChannelMessage } from '@/app/api/_actions/channels.actions'
import { messageFromRow } from '@/components/channels/channel-rows'
import { rememberCoworkers } from '@/components/channels/useChannelDirectory'
import { optimisticMessage, reconcile, sendDraft, type Draft, type StreamMessage } from '@/components/channels/useChannelMessages'
import { useRealtimeSubscription } from '@/lib/live/useRealtimeSubscription'

export type ThreadStatus = 'loading' | 'ready' | 'missing'

// One thread: its first message and every reply, kept live, with the same optimistic send as the
// channel.
export function useChannelThread(channelId: string, rootId: string, me: WorkAuthor | null) {
    const [root, setRoot] = useState<ChannelMessage | null>(null)
    const [replies, setReplies] = useState<StreamMessage[]>([])
    const [status, setStatus] = useState<ThreadStatus>('loading')

    const apply = useCallback((result: Awaited<ReturnType<typeof getChannelThreadAction>>) => {
        if (!result.ok) {
            setStatus('missing')
            return
        }
        rememberCoworkers(result.coworkers)
        setRoot(result.root)
        setReplies(current => [...result.replies.map(reply => ({ ...reply, thread: null })), ...current.filter(reply => reply.sendState)])
        setStatus('ready')
    }, [])

    const load = useCallback(async () => apply(await getChannelThreadAction(channelId, rootId)), [channelId, rootId, apply])

    // The pane keys this hook's owner by thread: another thread starts from a fresh state.
    useEffect(() => {
        void getChannelThreadAction(channelId, rootId).then(apply)
    }, [channelId, rootId, apply])

    useRealtimeSubscription('channel_messages', {
        channelId: `channel-thread-${rootId}`,
        filter: { column: 'channel_id', value: channelId },
        onInsert: row => {
            if (row.parent_message_id !== rootId) return
            setReplies(current => reconcile(current, { ...messageFromRow(row), thread: null }))
        },
        onUpdate: row => {
            const changed = messageFromRow(row)
            if (changed.id === rootId) setRoot(changed)
            else setReplies(current => current.map(reply => (reply.id === changed.id ? { ...reply, ...changed } : reply)))
        },
        onResync: () => void load(),
    })

    const deliver = useCallback(
        async (pending: StreamMessage, draft: Draft): Promise<PostedChannelMessage | null> => {
            const result = await sendDraft(channelId, draft, rootId)
            if ('error' in result) {
                setReplies(current => current.map(reply => (reply.clientId === pending.clientId ? { ...reply, sendState: 'failed' } : reply)))
                return null
            }
            setReplies(current => {
                const landedAlready = current.some(reply => reply.id === result.message.id)
                const rest = landedAlready ? current.filter(reply => reply.clientId !== pending.clientId) : current
                return reconcile(rest, { ...result.message, thread: null })
            })
            return result
        },
        [channelId, rootId]
    )

    const send = useCallback(
        async (draft: Draft) => {
            if (!me) return null
            const pending = optimisticMessage(channelId, me, draft, rootId)
            setReplies(current => [...current, pending])
            return deliver(pending, draft)
        },
        [channelId, rootId, me, deliver]
    )

    const retry = useCallback(
        async (clientId: string) => {
            const failed = replies.find(reply => reply.clientId === clientId)
            if (!failed) return
            setReplies(current => current.map(reply => (reply.clientId === clientId ? { ...reply, sendState: 'sending' } : reply)))
            await deliver(failed, { body: failed.body, mentions: failed.mentions })
        },
        [replies, deliver]
    )

    const discard = useCallback((clientId: string) => setReplies(current => current.filter(reply => reply.clientId !== clientId)), [])

    const replace = useCallback(
        (changed: ChannelMessage) => {
            if (changed.id === rootId) setRoot(changed)
            else setReplies(current => current.map(reply => (reply.id === changed.id ? { ...reply, ...changed } : reply)))
        },
        [rootId]
    )

    return { root, replies, status, send, retry, discard, replace }
}
