'use client'

import { formatElapsed, useElapsed } from '@/hooks/useElapsed'

/**
 * Chrono live isolé : possède son propre state + interval (via useElapsed), de sorte que
 * le tick chaque seconde ne re-render QUE ce <span> — pas le bloc parent, donc ni
 * Streamdown ni le rendu des args/outputs d'outil. Renvoie null tant que le chrono n'a
 * jamais tourné (messages historiques déjà terminés au montage).
 */
export function ElapsedTime({ active, className }: { active: boolean; className?: string }) {
    const seconds = useElapsed(active)
    if (seconds === undefined) return null
    return <span className={className}>{formatElapsed(seconds)}</span>
}
