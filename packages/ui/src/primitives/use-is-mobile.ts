'use client'

import { useCallback, useSyncExternalStore } from 'react'

// 639.98 and not 640: Tailwind's `sm:` starts at min-width 640px, so `max-width: 640px` would make
// both the mobile branch and the sm: styles apply at exactly 640px.
const MOBILE_QUERY = '(max-width: 639.98px)'

function useSubscribe(query: string) {
    return useCallback(
        (onChange: () => void) => {
            const mql = window.matchMedia(query)
            mql.addEventListener('change', onChange)
            return () => mql.removeEventListener('change', onChange)
        },
        [query],
    )
}

export function useIsMobile(query = MOBILE_QUERY) {
    // The server snapshot has to be a stable `false`: it is what keeps the first client render in
    // sync with the HTML, the store then corrects it on commit.
    return useSyncExternalStore(useSubscribe(query), () => window.matchMedia(query).matches, () => false)
}

// Same store, but `null` until the query has actually been read client side. Callers that latch the
// value need to tell "not a phone" apart from "not known yet", or they latch the server default.
export function useResolvedIsMobile(query = MOBILE_QUERY) {
    return useSyncExternalStore<boolean | null>(useSubscribe(query), () => window.matchMedia(query).matches, () => null)
}
