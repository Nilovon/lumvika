'use client'

import { useEffect, useReducer } from 'react'

import { getCatalogServicesBySlugsAction } from '@/app/api/_actions/services.actions'
import type { ServiceSearchResult } from '@/lib/services/types'

// Catalog rows for a handful of slugs, resolved once for the whole browser session.
//
// The cache is at module level on purpose: the surfaces that need this are drawn inside a chat
// stream and are re-rendered on every tick of it, so a per-component fetch would ask the catalog for
// the same three apps dozens of times per message.

// `null` is an answer, not a gap: the catalog was asked and holds nothing under that slug. Stored so
// the same miss is not looked up again for the rest of the session.
const cache = new Map<string, ServiceSearchResult | null>()
const inFlight = new Map<string, Promise<void>>()

async function resolve(slugs: string[]): Promise<void> {
    // The action never throws, it answers with an empty list, so a catalog that is down leaves every
    // slug unresolved rather than leaving the caller in a permanent loading state.
    const rows = await getCatalogServicesBySlugsAction(slugs)
    const found = new Map(rows.map(row => [row.slug, row]))
    for (const slug of slugs) cache.set(slug, found.get(slug) ?? null)
}

export function useCatalogServices(slugs: string[]): { resolved: Map<string, ServiceSearchResult>; loading: boolean } {
    // The list arrives as a fresh array on every render, so the effect keys off its content.
    const key = slugs.join(',')
    const [, rerender] = useReducer((tick: number) => tick + 1, 0)

    useEffect(() => {
        const wanted = key ? key.split(',') : []
        const waits = [...new Set(wanted.map(slug => inFlight.get(slug)).filter((pending): pending is Promise<void> => !!pending))]
        const unasked = wanted.filter(slug => !cache.has(slug) && !inFlight.has(slug))
        if (!unasked.length && !waits.length) return

        if (unasked.length) {
            const job = resolve(unasked).finally(() => {
                for (const slug of unasked) inFlight.delete(slug)
            })
            for (const slug of unasked) inFlight.set(slug, job)
            waits.push(job)
        }

        let alive = true
        void Promise.all(waits).then(() => {
            if (alive) rerender()
        })
        return () => {
            alive = false
        }
    }, [key])

    const resolved = new Map<string, ServiceSearchResult>()
    for (const slug of slugs) {
        const row = cache.get(slug)
        if (row) resolved.set(slug, row)
    }

    return { resolved, loading: slugs.some(slug => !cache.has(slug)) }
}
