'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { LOUD_DWELL_MS, SOFT_DWELL_MS, advance, isLoud, type AnnouncedNotification, type AnnouncerState } from '@/lib/notifications/announcement'

export type InboxAnnouncerCurrent = { notification: AnnouncedNotification; bundled: number; loud: boolean }

const subscribeToVisibility = (onChange: () => void) => {
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
}

/**
 * Plays the arrivals one at a time above the hub's pill. A loud one stays up until the pointer has
 * been over it; nothing runs out while a card is open or the tab is hidden.
 */
export function useInboxAnnouncer(arrivals: AnnouncedNotification[], paused: boolean) {
    const [state, setState] = useState<AnnouncerState>(() => ({ cursor: arrivals.length, bundled: 1 }))
    const [hovered, setHovered] = useState(false)
    const [seen, setSeen] = useState(false)
    const tabHidden = useSyncExternalStore(
        subscribeToVisibility,
        () => document.hidden,
        () => false
    )

    const total = arrivals.length
    const notification = arrivals[state.cursor] ?? null
    const bundled = notification ? state.bundled : 1
    const loud = notification !== null && bundled === 1 && isLoud(notification.status)
    const held = loud && !seen

    const dismiss = useCallback(() => {
        setSeen(false)
        // The row unmounts under the pointer without a `pointerleave`.
        setHovered(false)
        setState(current => advance(current, total))
    }, [total])

    useEffect(() => {
        if (!notification || paused || hovered || held || tabHidden) return
        const timer = setTimeout(dismiss, loud ? LOUD_DWELL_MS : SOFT_DWELL_MS)
        return () => clearTimeout(timer)
    }, [notification, paused, hovered, held, tabHidden, loud, dismiss])

    const setHeld = useCallback((value: boolean) => {
        setHovered(value)
        if (value) setSeen(true)
    }, [])

    const current: InboxAnnouncerCurrent | null = notification ? { notification, bundled, loud } : null
    return { current, dismiss, setHeld }
}
