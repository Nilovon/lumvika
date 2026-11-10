'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from './iso-grid/hooks/usePrefersReducedMotion'

// Active brièvement une transition CSS (le temps d'une action : zoom/recenter, ou un changement de
// cadrage piloté par l'hôte) puis la coupe. Le pan/drag/molette appelle cancel() pour rester en
// manipulation directe, sans lag. Respecte prefers-reduced-motion : animate() devient un no-op
// (changement instantané).
//
// La durée demandée est *rendue* par le hook, pour que la règle CSS et le minuteur qui la retire
// lisent la même valeur : un déplacement de scène dure bien plus longtemps qu'un clic sur zoom+, et
// les deux passent par ici.

// Marge entre la fin de la transition CSS et le retrait de la propriété : la retirer pile à
// l'échéance couperait la dernière frame et ferait sauter le transform à sa valeur finale.
const RELEASE_SLACK_MS = 40

export function useTransientTransition(defaultMs = 300) {
    const reducedMotion = usePrefersReducedMotion()
    // null = rien en vol. Un seul état porte le fait d'animer *et* la durée, ils ne peuvent donc pas
    // diverger d'un render.
    const [durationMs, setDurationMs] = useState<number | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clearTimer = () => {
        if (timer.current) {
            clearTimeout(timer.current)
            timer.current = null
        }
    }

    const animate = useCallback(
        (ms: number = defaultMs) => {
            if (reducedMotion || !(ms > 0)) return
            setDurationMs(ms)
            clearTimer()
            timer.current = setTimeout(() => setDurationMs(null), ms + RELEASE_SLACK_MS)
        },
        [defaultMs, reducedMotion]
    )

    const cancel = useCallback(() => {
        clearTimer()
        setDurationMs(null)
    }, [])

    useEffect(() => clearTimer, [])

    return { animating: durationMs !== null, durationMs, animate, cancel }
}
