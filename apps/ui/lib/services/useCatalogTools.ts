'use client'

import { getCatalogServicesBySlugsAction } from '@/app/api/_actions/services.actions'
import { useEffect, useState } from 'react'

// What a tool tile needs of a service, and nothing more.
export type CatalogTool = { slug: string; name: string; icon: string | null; category: string }

// Resolves curated slugs against the live catalogue. `null` while loading, so a
// caller can tell "not fetched yet" from "none of these slugs are enabled any more".
//
// The result carries the slugs it was fetched for rather than being cleared when they change: a
// stale key simply reads as "not loaded", which keeps the state write inside the async callback.
export function useCatalogTools(slugs: string[]): CatalogTool[] | null {
    const [cache, setCache] = useState<{ key: string; tools: CatalogTool[] } | null>(null)
    const key = slugs.join(',')
    const tools = cache?.key === key ? cache.tools : null

    useEffect(() => {
        // No slugs means the caller is not showing tools yet, so there is nothing worth a round trip.
        if (tools || slugs.length === 0) return
        let active = true
        void getCatalogServicesBySlugsAction(slugs).then(rows => {
            if (!active) return
            // The action resolves by slug and promises nothing about order, so the curated ranking
            // is reapplied here rather than trusted from the query.
            const bySlug = new Map(rows.map(row => [row.slug, row]))
            setCache({
                key,
                tools: slugs.flatMap(slug => {
                    const row = bySlug.get(slug)
                    return row ? [{ slug: row.slug, name: row.name, icon: row.icon, category: row.category }] : []
                }),
            })
        })
        return () => {
            active = false
        }
    }, [key, slugs, tools])

    return tools
}
