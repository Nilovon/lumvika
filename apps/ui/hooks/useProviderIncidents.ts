'use client'

import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import type { ProviderIncident } from '@/lib/provider-status/provider-status'
import { useCallback, useState } from 'react'

const POLL_INTERVAL = 2 * 60 * 1000

export function useProviderIncidents(): ProviderIncident[] {
    const [incidents, setIncidents] = useState<ProviderIncident[]>([])

    const sync = useCallback(async () => {
        try {
            const res = await fetch('/api/provider-status', { cache: 'no-store' })
            if (!res.ok) return
            const body = (await res.json()) as { incidents: ProviderIncident[] }
            setIncidents(body.incidents)
        } catch {}
    }, [])

    useVisibleInterval(sync, POLL_INTERVAL)

    return incidents
}
