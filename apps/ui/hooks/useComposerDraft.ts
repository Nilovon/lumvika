'use client'

import { useCallback } from 'react'

function getStorageKey(uid: string) {
    return `composer-draft-${uid}`
}

export function useComposerDraft(uid: string) {
    const load = useCallback(() => {
        try {
            return localStorage.getItem(getStorageKey(uid)) ?? ''
        } catch {
            return ''
        }
    }, [uid])

    const save = useCallback((text: string) => {
        try {
            if (text) {
                localStorage.setItem(getStorageKey(uid), text)
            } else {
                localStorage.removeItem(getStorageKey(uid))
            }
        } catch {}
    }, [uid])

    const clear = useCallback(() => {
        try {
            localStorage.removeItem(getStorageKey(uid))
        } catch {}
    }, [uid])

    return { load, save, clear }
}
