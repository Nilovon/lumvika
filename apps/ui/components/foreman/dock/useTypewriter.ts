'use client'

import { useEffect, useState } from 'react'

type Typing = { index: number; length: number; erasing: boolean }

/**
 * Types each phrase, holds it, erases it, moves to the next: the placeholder suggests what to ask.
 * The first phrase is already written on mount, so the field never opens empty. Paused, it stays on
 * that first phrase.
 */
export function useTypewriter(phrases: readonly string[], { paused = false, typeMs = 42, holdMs = 2600, eraseMs = 16 } = {}) {
    const [typing, setTyping] = useState<Typing>({ index: 0, length: phrases[0].length, erasing: false })
    const phrase = phrases[typing.index]

    useEffect(() => {
        if (paused) return
        const full = typing.length === phrase.length
        const delay = typing.erasing ? eraseMs : full ? holdMs : typeMs
        const timer = setTimeout(() => {
            setTyping(current => {
                if (current.erasing) {
                    if (current.length > 0) return { ...current, length: current.length - 1 }
                    return { index: (current.index + 1) % phrases.length, length: 0, erasing: false }
                }
                if (current.length < phrase.length) return { ...current, length: current.length + 1 }
                return { ...current, erasing: true }
            })
        }, delay)
        return () => clearTimeout(timer)
    }, [paused, typing, phrase, phrases.length, typeMs, holdMs, eraseMs])

    return paused ? phrases[0] : phrase.slice(0, typing.length)
}
