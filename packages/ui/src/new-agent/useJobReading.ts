'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { EMPTY_READING, MAX_READABLE_LENGTH, MIN_READABLE_LENGTH, type JobReading } from './reading'

const PAUSE_MS = 600

export type JobReader = (description: string) => Promise<JobReading>

function readable(text: string): string {
    return text.trim().slice(0, MAX_READABLE_LENGTH)
}

// Reads the description at each pause in the typing. The last reading stays up while the next one
// is on its way, so a name does not blink out between two words; `seed` is a reading already known
// for a text, which a still of the lab opens on.
//
// `settle` is for the moment the user clicks Create before the reading of what they just typed has
// come back: it resolves with that reading, asked for at once rather than after the pause.
export function useJobReading(text: string, read: JobReader, seed?: { text: string; reading: JobReading }) {
    const key = readable(text)
    const cache = useRef(new Map<string, Promise<JobReading>>(seed ? [[readable(seed.text), Promise.resolve(seed.reading)]] : []))
    const [settled, setSettled] = useState<{ key: string; reading: JobReading } | null>(seed ? { key: readable(seed.text), reading: seed.reading } : null)
    const tooShort = key.length < MIN_READABLE_LENGTH

    const readNow = useCallback(
        (wanted: string): Promise<JobReading> => {
            const known = cache.current.get(wanted)
            if (known) return known
            const pending = read(wanted).catch(() => EMPTY_READING)
            cache.current.set(wanted, pending)
            return pending
        },
        [read]
    )

    useEffect(() => {
        if (tooShort || settled?.key === key) return
        let active = true
        const timer = setTimeout(
            () => {
                void readNow(key).then(reading => {
                    if (active) setSettled({ key, reading })
                })
            },
            cache.current.has(key) ? 0 : PAUSE_MS
        )
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [key, tooShort, settled?.key, readNow])

    const settle = useCallback((): Promise<JobReading> => (tooShort ? Promise.resolve(EMPTY_READING) : readNow(key)), [key, tooShort, readNow])

    return {
        reading: tooShort ? EMPTY_READING : (settled?.reading ?? EMPTY_READING),
        pending: !tooShort && settled?.key !== key,
        settle,
    }
}
