'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

// Which conversation is open, kept in the URL so a link, a reload and the back button all land on
// it: `/channels/<id>`, `?thread=<message id>` or `?panel=details` for the side pane. Moving between
// them goes through the history API, so the screen stays mounted instead of reloading a page.

export type ChannelSidePane = { kind: 'thread'; rootId: string } | { kind: 'details' } | null

const CHANNEL_PATH = /^\/channels\/([^/?#]+)/

export function channelHref(channelId: string | null, side: ChannelSidePane = null): string {
    const base = channelId ? `/channels/${encodeURIComponent(channelId)}` : '/channels'
    if (side?.kind === 'thread') return `${base}?thread=${encodeURIComponent(side.rootId)}`
    if (side?.kind === 'details') return `${base}?panel=details`
    return base
}

export function useChannelRoute(initialChannelId?: string) {
    const pathname = usePathname()
    const params = useSearchParams()
    const matched = pathname?.match(CHANNEL_PATH)
    const channelId = matched ? decodeURIComponent(matched[1]) : pathname?.startsWith('/channels') ? null : (initialChannelId ?? null)
    const thread = params?.get('thread')
    const side: ChannelSidePane = thread ? { kind: 'thread', rootId: thread } : params?.get('panel') === 'details' ? { kind: 'details' } : null

    const go = useCallback((nextChannelId: string | null, nextSide: ChannelSidePane = null, replace = false) => {
        const href = channelHref(nextChannelId, nextSide)
        if (replace) window.history.replaceState(null, '', href)
        else window.history.pushState(null, '', href)
    }, [])

    return { channelId, side, go }
}
