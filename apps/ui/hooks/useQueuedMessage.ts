'use client'

import { useCallback, useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import { parseQueued, type QueuedMessage } from '@/lib/chat/queued-message'

function getStorageKey(uid: string) {
    return `composer-queued-${uid}`
}

function read(uid: string): QueuedMessage | null {
    try {
        return parseQueued(localStorage.getItem(getStorageKey(uid)))
    } catch {
        return null
    }
}

// `restoredId` names what was already waiting when the chat opened, as opposed to what the user
// just queued: only the former has to prove the run it was queued behind is still the one running.
type QueueState = { queued: QueuedMessage | null; restoredId: string | null }

/**
 * The single message waiting behind the run in flight. Stored next to the composer draft (see
 * useComposerDraft) so it survives a reload while the run keeps going, and so a second tab on the
 * same conversation drops its pill as soon as this one sends or discards it.
 */
export function useQueuedMessage(uid: string) {
    const [{ queued, restoredId }, setState] = useState<QueueState>({ queued: null, restoredId: null })

    useEffect(() => {
        const found = read(uid)
        setState({ queued: found, restoredId: found?.id ?? null })
    }, [uid])

    // The storage event only fires in the other tabs, which is exactly who needs telling.
    useEffect(() => {
        const key = getStorageKey(uid)
        const onStorage = (event: StorageEvent) => {
            if (event.key !== null && event.key !== key) return
            setState(prev => ({ ...prev, queued: read(uid) }))
        }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [uid])

    const enqueue = useCallback(
        (text: string, behindRunId: string | null) => {
            const item: QueuedMessage = { id: nanoid(8), text, createdAt: Date.now(), behindRunId }
            try {
                localStorage.setItem(getStorageKey(uid), JSON.stringify(item))
            } catch {}
            setState(prev => ({ ...prev, queued: item }))
        },
        [uid]
    )

    const clear = useCallback(() => {
        try {
            localStorage.removeItem(getStorageKey(uid))
        } catch {}
        setState(prev => ({ ...prev, queued: null }))
    }, [uid])

    return { queued, restoredId, enqueue, clear }
}
