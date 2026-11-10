'use client'

import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

// True quand l'utilisateur a activé « réduire les animations » au niveau OS. SSR-safe : rend `false`
// au premier paint (serveur), puis se resynchronise et écoute les changements côté client.
export function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false)

    useEffect(() => {
        const mql = window.matchMedia(QUERY)
        setReduced(mql.matches)
        const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
        mql.addEventListener('change', onChange)
        return () => mql.removeEventListener('change', onChange)
    }, [])

    return reduced
}
