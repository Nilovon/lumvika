'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'

import { chatPath, chatRouteOf, type ChatRoute } from '@/lib/assistant/chat-route'

// Native history calls rather than the router: the URL follows the screen without remounting the
// page, so a chat created by its first message keeps streaming while its address appears.
// `openedOn` is the chat the page was rendered for, read until the pathname is known.
export function useChatRoute(openedOn?: string) {
    const pathname = usePathname()
    const route = useMemo(() => chatRouteOf(pathname ?? (openedOn ? `/chat/${openedOn}` : null)), [pathname, openedOn])
    const go = useCallback((next: ChatRoute, { replace = false }: { replace?: boolean } = {}) => {
        const path = chatPath(next)
        if (path === window.location.pathname) return
        if (replace) window.history.replaceState(null, '', path)
        else window.history.pushState(null, '', path)
    }, [])
    return { route, go }
}
