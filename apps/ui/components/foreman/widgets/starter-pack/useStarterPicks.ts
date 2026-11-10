'use client'

import { useCallback, useState } from 'react'

import { MAX_STARTER_PICKS } from '@/lib/onboarding/starter-packs'

// The cards picked so far, and the wall past the trial's ceiling. `blocked` is the card someone tried
// to add once the three places were taken, so that card can say why it did not take.

export type StarterPicks = {
    picked: string[]
    full: boolean
    blocked: string | null
    isPicked: (slug: string) => boolean
    toggle: (slug: string) => void
}

export function useStarterPicks(): StarterPicks {
    const [picked, setPicked] = useState<string[]>([])
    const [blocked, setBlocked] = useState<string | null>(null)

    const toggle = useCallback((slug: string) => {
        setPicked(current => {
            if (current.includes(slug)) {
                setBlocked(null)
                return current.filter(entry => entry !== slug)
            }
            if (current.length >= MAX_STARTER_PICKS) {
                setBlocked(slug)
                return current
            }
            setBlocked(null)
            return [...current, slug]
        })
    }, [])

    return { picked, full: picked.length >= MAX_STARTER_PICKS, blocked, isPicked: (slug: string) => picked.includes(slug), toggle }
}
