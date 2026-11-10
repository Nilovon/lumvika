'use client'

import { useEffect, useState, type RefObject } from 'react'

// A sliver of the block's border above the bottom edge is not "in view": the cue would sit right on it.
const PEEK_BAND = '0px 0px -56px 0px'

export type PendingVisibility = 'in-view' | 'out-of-view' | 'absent'

// Where the block waiting at the end of the thread stands in its scroller. Observed again for each
// `key`, the waiting block being a new element each time. Tagged with its key so a new block never
// reads the previous one's answer before its own first observation.
export function usePendingInView(scrollRef: RefObject<HTMLElement | null>, blockRef: RefObject<HTMLElement | null> | undefined, key: string | null): PendingVisibility {
    const [observed, setObserved] = useState<{ key: string; visibility: PendingVisibility } | null>(null)

    useEffect(() => {
        if (key === null) return
        const scrollEl = scrollRef.current
        const blockEl = blockRef?.current
        if (!scrollEl || !blockEl) {
            setObserved({ key, visibility: 'absent' })
            return
        }
        const observer = new IntersectionObserver(([entry]) => setObserved({ key, visibility: entry.isIntersecting ? 'in-view' : 'out-of-view' }), { root: scrollEl, rootMargin: PEEK_BAND, threshold: 0 })
        observer.observe(blockEl)
        return () => observer.disconnect()
    }, [scrollRef, blockRef, key])

    if (key === null) return 'absent'
    return observed?.key === key ? observed.visibility : 'in-view'
}
