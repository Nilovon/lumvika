'use client'

import { useEffect } from 'react'

import type { CompanyFindingsRow, DiscoveryEvent } from '@/lib/company/explore/findings'
import { useDiscoveriesStore } from '@/stores/discoveries.store'

const ENDPOINT = '/api/onboarding/discoveries'
const POLL_MS = 3000
// The row is written the moment the exploration is requested, so nothing at all after this long
// means none was: a workspace without a site, or one that never got as far as the welcome card.
const EMPTY_READS_BEFORE_GIVING_UP = 10
// One exploration at a time across every signup: a busy hour can keep a run queued for a while.
const MAX_POLL_MS = 20 * 60 * 1000

const siteDomain = (site: string) => {
    try {
        return new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`).hostname.replace(/^www\./i, '')
    } catch {
        return site
    }
}

let live: { domain: string; controller: AbortController; result: Promise<boolean> } | null = null

/**
 * What the free sources say about the site typed in the welcome card, card by card. A new site
 * replaces the one before: its stream is cut and its cards cleared. The same site asked again (the
 * Next button after the typing pause) gets the stream already under way. Resolves to whether
 * anything was found.
 */
export function streamLiveDiscoveries(site: string): Promise<boolean> {
    const domain = siteDomain(site)
    if (live?.domain === domain) return live.result
    live?.controller.abort()
    const controller = new AbortController()
    live = { domain, controller, result: readLiveStream(site, domain, controller.signal) }
    return live.result
}

async function readLiveStream(site: string, domain: string, signal: AbortSignal): Promise<boolean> {
    const store = useDiscoveriesStore.getState()
    store.reset(domain)

    let found = 0
    try {
        const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: site }), signal })
        if (!response.ok || !response.body) return false
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += value
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            const events = lines.filter(Boolean).map(line => JSON.parse(line) as DiscoveryEvent)
            found += events.filter(event => event.type === 'found').length
            store.apply(events)
        }
        return found > 0
    } catch {
        // A stream cut short must not leave its teasers searching forever.
        if (!signal.aborted) store.apply([{ type: 'end' }])
        return false
    }
}

/** Reads the full exploration back while it runs: the cards it adds and the sources it is still on. */
export function useCompanyDiscoveries(active: boolean) {
    useEffect(() => {
        if (!active) return
        let stopped = false
        let timer: ReturnType<typeof setTimeout> | undefined
        let emptyReads = 0
        const startedAt = Date.now()

        const read = async () => {
            const row = await fetch(ENDPOINT, { cache: 'no-store' })
                .then(response => (response.ok ? (response.json() as Promise<CompanyFindingsRow | null>) : null))
                .catch(() => null)
            if (stopped) return
            if (row) useDiscoveriesStore.getState().applyRow(row)
            else emptyReads += 1

            const settled = row !== null && row.status !== 'running'
            if (settled || emptyReads >= EMPTY_READS_BEFORE_GIVING_UP || Date.now() - startedAt > MAX_POLL_MS) return
            timer = setTimeout(read, POLL_MS)
        }
        void read()

        return () => {
            stopped = true
            clearTimeout(timer)
        }
    }, [active])
}
