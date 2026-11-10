'use client'

import { useEffect, useState } from 'react'

import { listConnectorCatalogAction } from '@/app/api/_actions/template.actions'
import type { ConnectorCatalog } from '@lumvika/ui/new-agent'

// One read per page load, shared by every opening of the dialog: the catalogue does not change
// while someone is describing an agent.
let loaded: ConnectorCatalog | null = null
let loading: Promise<ConnectorCatalog> | null = null

function loadCatalog(): Promise<ConnectorCatalog> {
    loading ??= listConnectorCatalogAction()
        .then(entries => {
            loaded = new Map(entries.map(entry => [entry.slug, entry]))
            return loaded
        })
        .catch(error => {
            loading = null
            throw error
        })
    return loading
}

// The whole connector catalogue, by slug: name and icon, enough to draw a logo and to search by
// name. `null` until it lands, and it stays null if the read fails, which leaves the dialog usable
// without its logos.
export function useConnectorCatalog(enabled: boolean): ConnectorCatalog | null {
    const [catalog, setCatalog] = useState<ConnectorCatalog | null>(loaded)

    useEffect(() => {
        if (!enabled || catalog) return
        let active = true
        loadCatalog().then(
            next => {
                if (active) setCatalog(next)
            },
            () => {}
        )
        return () => {
            active = false
        }
    }, [enabled, catalog])

    return catalog
}
