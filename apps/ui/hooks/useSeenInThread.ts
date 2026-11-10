'use client'

import { useEffect, useState } from 'react'

// Under the fade at the top of the thread a block is not really seen, even when it is on screen.
const PILLS_BAND = '-24px 0px 0px 0px'
const SEEN_RATIO = 0.4

// Whether enough of a block of the thread is in view, in its scroller, to count as seen.
export function useSeenInThread(element: HTMLElement | null, scroller: Element | null): boolean {
    const [seen, setSeen] = useState(true)

    useEffect(() => {
        if (!element || !scroller) return
        const observer = new IntersectionObserver(([entry]) => setSeen(entry.intersectionRatio >= SEEN_RATIO), { root: scroller, rootMargin: PILLS_BAND, threshold: [0, SEEN_RATIO, 1] })
        observer.observe(element)
        return () => observer.disconnect()
    }, [element, scroller])

    return element ? seen : false
}
