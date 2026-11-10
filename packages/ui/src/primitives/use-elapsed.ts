'use client'

import { useEffect, useRef, useState } from 'react'

export { formatElapsed } from '@rerun/contracts'

/**
 * Chrono live : démarre quand `active` passe à true, tick chaque seconde,
 * et fige la durée finale exacte quand `active` repasse à false.
 * Renvoie `undefined` tant que ça n'a jamais tourné (messages historiques
 * déjà terminés au montage → pas de chrono parasite).
 */
export function useElapsed(active: boolean): number | undefined {
    const [seconds, setSeconds] = useState<number | undefined>(undefined)
    const startRef = useRef<number | null>(null)

    useEffect(() => {
        if (active) {
            const start = Date.now()
            startRef.current = start
            setSeconds(0)
            // Tick à 100ms : sous 10s on affiche les dixièmes (effet de vitesse), au-delà
            // on retombe sur des secondes entières — et comme la valeur ne change plus que
            // chaque seconde, React déduplique les setState identiques (pas de re-render).
            const id = setInterval(() => setSeconds(tick(start)), 100)
            return () => clearInterval(id)
        }
        // Figé : durée finale exacte au moment de l'arrêt, conservée à l'écran.
        if (startRef.current !== null) {
            setSeconds(Math.max(0.1, tick(startRef.current)))
            startRef.current = null
        }
    }, [active])

    return seconds
}

/** Dixièmes sous 10s, secondes entières au-delà. */
function tick(start: number): number {
    const e = (Date.now() - start) / 1000
    return e < 10 ? Math.floor(e * 10) / 10 : Math.floor(e)
}
