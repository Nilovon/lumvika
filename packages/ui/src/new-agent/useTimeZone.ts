'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

// The browser's time zone, which every hour of the planner is told in. Null on the server, whose
// own zone would say nothing about the user's.
export function useTimeZone(): string | null {
    return useSyncExternalStore(
        subscribe,
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        () => null
    )
}

export function timeZoneOffset(timeZone: string): string | null {
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value ?? null
    } catch {
        return null
    }
}
