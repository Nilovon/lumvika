'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getChannelAction, type ChannelDetail } from '@/app/api/_actions/channels.actions'
import { rememberCoworkers } from '@/components/channels/useChannelDirectory'
import { useRealtimeSubscription } from '@/lib/live/useRealtimeSubscription'

export type ChannelDetailStatus = 'loading' | 'ready' | 'missing'

// The open channel with its members and links, read again whenever it or its membership changes.
export function useChannelDetail(channelId: string) {
    const [detail, setDetail] = useState<ChannelDetail | null>(null)
    const [status, setStatus] = useState<ChannelDetailStatus>('loading')
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const apply = useCallback((result: Awaited<ReturnType<typeof getChannelAction>>) => {
        if (!result.ok) {
            setStatus('missing')
            return
        }
        rememberCoworkers(result.channel.coworkers)
        setDetail(result.channel)
        setStatus('ready')
    }, [])

    const load = useCallback(async () => apply(await getChannelAction(channelId)), [channelId, apply])

    const scheduleLoad = useCallback(() => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void load(), 250)
    }, [load])

    useEffect(() => {
        void getChannelAction(channelId).then(apply)
        return () => {
            if (timer.current) clearTimeout(timer.current)
        }
    }, [channelId, apply])

    useRealtimeSubscription('channels', { channelId: `channel-detail-${channelId}`, filter: { column: 'id', value: channelId }, onUpdate: scheduleLoad })
    useRealtimeSubscription('channel_members', {
        channelId: `channel-detail-members-${channelId}`,
        filter: { column: 'channel_id', value: channelId },
        onInsert: scheduleLoad,
        onDelete: row => {
            if (row.channel_id === channelId) scheduleLoad()
        },
    })

    return { detail, status, reload: load }
}
