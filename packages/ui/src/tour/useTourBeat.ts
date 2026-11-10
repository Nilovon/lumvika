'use client'

import { useEffect, useRef, useState } from 'react'

// Walks a timeline of beats on a chain of timeouts rather than one interval, so each beat holds for
// as long as it is worth holding. Typed on the hold alone: what a beat carries is the caller's
// business. The counter is monotonic, which is what lets an effect key on it and fire again for a
// beat that repeats the one before it.
//
// A pause resumes on the beat it stopped at: restarting the chain from zero would hold the current
// beat for the first one's length and then jump back to the second.
export function useTourBeat(beats: readonly { hold: number }[], paused: boolean): number {
    const [tick, setTick] = useState(0)
    const tickRef = useRef(0)

    useEffect(() => {
        if (paused) return
        let timer: ReturnType<typeof setTimeout>
        const advance = (current: number) => {
            timer = setTimeout(() => {
                const next = current + 1
                tickRef.current = next
                setTick(next)
                advance(next)
            }, beats[current % beats.length].hold)
        }
        advance(tickRef.current)
        return () => clearTimeout(timer)
    }, [beats, paused])

    return tick
}
