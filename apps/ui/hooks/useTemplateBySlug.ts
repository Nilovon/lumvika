'use client'

import { useEffect, useState } from 'react'
import { getSharedTemplateAction } from '@/app/api/_actions/template.actions'
import type { LibraryTemplate } from '@/lib/templates/library'

// One template, by slug, for a surface that holds a slug and nothing else — the steward's card is
// drawn from what its model wrote, and the model cannot write a board capture. The read goes
// through the shared-link action rather than the library listing: `show_in_library` has no say on a
// link somebody arrived on, an unlisted template is exactly the case it serves, and it comes back
// as one row instead of the whole catalogue.
//
// The cache lives at module scope, like the library's: a card replayed from the transcript on every
// re-render must not refetch, and two cards on the same slug must not fetch twice.

export type TemplateBySlug = { status: 'loading' } | { status: 'found'; template: LibraryTemplate } | { status: 'missing' }

const cache = new Map<string, LibraryTemplate | null>()
const inFlight = new Map<string, Promise<LibraryTemplate | null>>()

export function useTemplateBySlug(slug: string | null): TemplateBySlug {
    const [, bumpVersion] = useState(0)
    const cached = slug ? cache.get(slug) : undefined

    useEffect(() => {
        if (!slug || cache.has(slug)) return
        let active = true
        let request = inFlight.get(slug)
        if (!request) {
            request = getSharedTemplateAction(slug)
            inFlight.set(slug, request)
        }
        void request
            .then(found => {
                cache.set(slug, found)
            })
            // A failed action must not pin the slug as "still loading" forever: it reads as missing,
            // which is the fallback the card already knows how to draw.
            .catch(() => {
                cache.set(slug, null)
            })
            .finally(() => {
                inFlight.delete(slug)
                if (active) bumpVersion(version => version + 1)
            })
        return () => {
            active = false
        }
    }, [slug])

    if (!slug) return { status: 'missing' }
    if (cached === undefined) return { status: 'loading' }
    return cached ? { status: 'found', template: cached } : { status: 'missing' }
}
