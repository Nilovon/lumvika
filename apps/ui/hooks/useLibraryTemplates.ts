'use client'

import { listLibraryTemplatesAction } from '@/app/api/_actions/template.actions'
import type { LibraryTemplate } from '@/lib/templates/library'
import { useTemplatePurchaseStore } from '@/stores/template-purchase.store'
import { useSession } from '@/lib/auth/session/SessionProvider'
import { useEffect, useState } from 'react'

// Whether this workspace owns a template is per-workspace and changes under the dialogs that read
// this list, so it cannot be cached for the lifetime of the app. The cache carries the key it was
// fetched for rather than being invalidated by a second effect: a stale key simply reads as "not
// loaded", and the fetch below picks it up.
//
// The cache lives at module scope rather than in the calling component: the New agent dialog and
// the library both read the same catalogue, and a cache per component would fetch it twice.
let cache: { key: string; rows: LibraryTemplate[] } | null = null
// Two callers enabled at the same time would otherwise each start their own request, since neither
// re-renders until one of them lands.
let inFlight: { key: string; promise: Promise<LibraryTemplate[]> } | null = null

/** The published catalogue, fetched once per workspace and purchase, or null while it loads. */
export function useLibraryTemplates(enabled: boolean): LibraryTemplate[] | null {
    const workspaceId = useSession().workspace?.id
    const purchaseVersion = useTemplatePurchaseStore(state => state.version)
    const key = `${workspaceId ?? 'none'}:${purchaseVersion}`

    const [, bumpVersion] = useState(0)
    const templates = cache?.key === key ? cache.rows : null

    useEffect(() => {
        if (!enabled || templates) return
        let active = true
        if (inFlight?.key !== key) inFlight = { key, promise: listLibraryTemplatesAction() }
        void inFlight.promise.then(rows => {
            cache = { key, rows }
            if (active) bumpVersion(v => v + 1)
        })
        return () => {
            active = false
        }
    }, [enabled, templates, key])

    return templates
}
