'use client'

import { useEffect, useRef, useState } from 'react'

export type RenderedFrame = { width: number; height: number }

// La boîte dans laquelle un board est réellement peint. C'est elle qui décide du cadrage, donc elle
// se mesure plutôt que de se deviner appelant par appelant.
//
// clientWidth / clientHeight et surtout pas getBoundingClientRect : une scène rendue à sa taille de
// référence puis réduite par un `transform: scale()` (l'aperçu de l'admin), ou une dialog qui anime
// sa propre échelle à l'ouverture, rendraient un rect transformé — donc un zoom faux, et pour la
// dialog un cadre qu'elle n'a jamais.
//
// Null tant que rien n'est mesuré : une boîte posée à zéro (ancêtre masqué) cadrerait la scène au
// plancher de zoom, et la grille ne revisite jamais sa première caméra.
export function useRenderedFrame() {
    const ref = useRef<HTMLDivElement>(null)
    const [frame, setFrame] = useState<RenderedFrame | null>(null)

    useEffect(() => {
        const element = ref.current
        if (!element) return
        const measure = () => {
            const { clientWidth, clientHeight } = element
            if (clientWidth > 0 && clientHeight > 0) setFrame({ width: clientWidth, height: clientHeight })
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    return { ref, frame }
}
