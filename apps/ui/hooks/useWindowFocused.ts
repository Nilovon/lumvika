'use client'

import { useEffect, useState } from 'react'

// A visible tab whose window sits behind another app still paints every frame, so visibilityState
// alone cannot tell that nobody is looking. True before the first sync so the first paint animates.
export function useWindowFocused(): boolean {
    const [focused, setFocused] = useState(true)

    useEffect(() => {
        const sync = () => setFocused(document.hasFocus())
        sync()
        window.addEventListener('focus', sync)
        window.addEventListener('blur', sync)
        return () => {
            window.removeEventListener('focus', sync)
            window.removeEventListener('blur', sync)
        }
    }, [])

    return focused
}
