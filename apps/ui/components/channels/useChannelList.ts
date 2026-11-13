'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { listChannelsAction } from '@/app/api/_actions/channels.actions'
import type { ChannelListItem } from '@/app/api/_services/work/channels.service'
import { useSession } from '@/supabase/session/SessionProvider'
import { useRealtimeSubscription } from '@/supabase/useRealtimeSubscription'

const RELOAD_DEBOUNCE_MS = 400

// The channel list kept live: any change to a channel, a membership or a new message of the
// workspace reads the list again (one call, the unread counts come with it). The open channel reads
// as read on this screen, whatever the last count said.
export function useChannelList(activeChannelId: string | null) {
    const { workspace } = useSession()
    const workspaceId = workspace?.id
    const [channels, setChannels] = useState<ChannelListItem[] | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [failed, setFailed] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const apply = useCallback((result: Awaited<ReturnType<typeof listChannelsAction>>) => {
        if (!result.ok) {
            setFailed(true)
            return
        }
        setFailed(false)
        setChannels(result.channels)
        setUserId(result.userId)
    }, [])

    const reload = useCallback(async () => apply(await listChannelsAction()), [apply])

    const scheduleReload = useCallback(() => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS)
    }, [reload])

    useEffect(() => {
        void listChannelsAction().then(apply)
        return () => {
            if (timer.current) clearTimeout(timer.current)
        }
    }, [apply])

    const enabled = workspaceId !== undefined
    const filter = workspaceId !== undefined ? { column: 'workspace_id', value: workspaceId } : undefined
    useRealtimeSubscription('channels', { channelId: 'channel-list-channels', filter, enabled, onInsert: scheduleReload, onUpdate: scheduleReload, onResync: scheduleReload })
    useRealtimeSubscription('channel_members', {
        channelId: 'channel-list-members',
        filter,
        enabled,
        onInsert: scheduleReload,
        onUpdate: scheduleReload,
        onDelete: row => {
            if (row.workspace_id === workspaceId) scheduleReload()
        },
    })
    useRealtimeSubscription('channel_messages', { channelId: 'channel-list-messages', filter, enabled, onInsert: scheduleReload })

    const shown = channels?.map(channel => (channel.id === activeChannelId && channel.unreadCount > 0 ? { ...channel, unreadCount: 0 } : channel)) ?? null
    return { channels: shown, userId, failed, reload }
}
