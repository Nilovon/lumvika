'use client'

import { useEffect } from 'react'

import { markChannelReadAction } from '@/app/api/_actions/channels.actions'

const MARK_DELAY_MS = 800

// A channel on screen is read: when it opens, when something new lands in it, and when the tab comes
// back to the front. A tab in the background reads nothing.
export function useMarkChannelRead(channelId: string, enabled: boolean, activityAt: number, messageCount: number) {
    useEffect(() => {
        if (!enabled) return
        let timer: ReturnType<typeof setTimeout> | null = null
        const mark = () => {
            if (document.visibilityState !== 'visible') return
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => void markChannelReadAction(channelId), MARK_DELAY_MS)
        }
        mark()
        document.addEventListener('visibilitychange', mark)
        return () => {
            if (timer) clearTimeout(timer)
            document.removeEventListener('visibilitychange', mark)
        }
    }, [channelId, enabled, activityAt, messageCount])
}
