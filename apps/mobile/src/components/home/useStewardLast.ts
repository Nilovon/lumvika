import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'

import { fetchStewardConversation } from '@/api/steward'
import { useAuth } from '@/auth/AuthProvider'
import { cachedSteward } from '@/data/local-cache'

export type StewardLast = { title: string | null; running: boolean }

// What the Steward's row on the Home says: the title of its last conversation, first as the phone
// kept it, then as the hub tells it each time the Home comes back into view.
export function useStewardLast(): StewardLast {
    const { session, me } = useAuth()
    const accessToken = session?.access_token
    const workspaceId = me?.workspace.id
    const [last, setLast] = useState<StewardLast>(() => ({ title: workspaceId ? (cachedSteward(workspaceId).read()?.last?.title ?? null) : null, running: false }))

    useFocusEffect(
        useCallback(() => {
            if (!accessToken || !workspaceId) return
            let stale = false
            fetchStewardConversation({ accessToken, workspaceId })
                .then(conversation => !stale && setLast({ title: conversation?.title ?? null, running: Boolean(conversation?.activeRunId) }))
                .catch(() => {})
            return () => {
                stale = true
            }
        }, [accessToken, workspaceId])
    )

    return last
}
