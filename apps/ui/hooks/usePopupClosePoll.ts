'use client'

import { useCallback, useEffect, useRef } from 'react'

// Watches an OAuth popup and fires onClosed when the user dismisses it, so the caller can
// leave its "waiting for authorization" state. Owns the interval's lifecycle: cleared on
// re-watch, on unmount, and a blocked popup (window.open returned null) reports closed
// immediately instead of polling forever.
export function usePopupClosePoll(onClosed: () => void): (popup: Window | null) => void {
    const onClosedRef = useRef(onClosed)
    onClosedRef.current = onClosed
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const clear = () => {
        if (intervalRef.current !== null) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
        }
    }

    useEffect(() => clear, [])

    return useCallback(popup => {
        clear()
        if (!popup) {
            onClosedRef.current()
            return
        }
        intervalRef.current = setInterval(() => {
            if (popup.closed) {
                clear()
                onClosedRef.current()
            }
        }, 500)
    }, [])
}
