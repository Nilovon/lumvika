'use client'

import { listLibraryCreatorsAction } from '@/app/api/_actions/template.actions'
import type { LibraryCreator } from '@/lib/templates/library'
import { useEffect, useState } from 'react'

// Public fiches, the same for every workspace, so one read per page load is enough.
let cache: LibraryCreator[] | null = null
let inFlight: Promise<LibraryCreator[]> | null = null

/** The creator directory Discover introduces, or null while it loads. */
export function useLibraryCreators(enabled: boolean): LibraryCreator[] | null {
    const [creators, setCreators] = useState(cache)

    useEffect(() => {
        if (!enabled || creators) return
        let active = true
        inFlight ??= listLibraryCreatorsAction()
            .then(rows => {
                cache = rows
                return rows
            })
            .catch(() => {
                inFlight = null
                return []
            })
        void inFlight.then(rows => {
            if (active) setCreators(rows)
        })
        return () => {
            active = false
        }
    }, [enabled, creators])

    return creators
}
