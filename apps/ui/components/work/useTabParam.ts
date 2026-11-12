'use client'

import { useSearchParams } from 'next/navigation'

// The tab of a screen lives in its address (`?tab=blocked`), so a link from the overview opens the
// right one and a reload keeps it. The first tab is the bare address.
export function useTabParam<T extends string>(tabs: readonly T[]): [T, (next: T) => void] {
    const searchParams = useSearchParams()
    const raw = searchParams.get('tab')
    const tab = (tabs as readonly string[]).includes(raw ?? '') ? (raw as T) : tabs[0]

    const setTab = (next: T) => {
        const params = new URLSearchParams(window.location.search)
        if (next === tabs[0]) params.delete('tab')
        else params.set('tab', next)
        const query = params.toString()
        // Next keeps useSearchParams in step with the history API, without a round trip to the server.
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    }
    return [tab, setTab]
}
