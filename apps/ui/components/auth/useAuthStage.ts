'use client'

import { agentTileStyle } from '@rerun/ui/iso-grid'
import { useReducedMotion } from 'motion/react'
import { useMemo } from 'react'

import { buildAuthStage, stageLinkId } from './auth-stage-board'
import { useStageScript } from './useStageScript'

// La scène du décor d'auth, prête à peindre : la géométrie de auth-stage-board, rejouée par
// useStageScript. Partagée par le décor plein cadre du web et par celui de l'app iOS, qui ne
// diffèrent que par leur caméra.
export function useAuthStage() {
    const stage = useMemo(() => buildAuthStage(), [])
    const animated = !useReducedMotion()

    const { statuses, hotLinks } = useStageScript({ script: stage.script, enabled: animated })

    // Tout ce qui est allumé à cet instant, tous agents confondus : plusieurs liens à la fois, c'est
    // ce qui raconte que ça bosse en parallèle. Un agent en collaboration en tient deux, l'appel
    // vers son outil et le beam vers son binôme.
    const hot = useMemo(() => new Set(Object.values(hotLinks).flat()), [hotLinks])

    // La cascade d'entrée est portée par le CSS (dropDelay / appearDelay) : toutes les tuiles sont
    // montées d'emblée, aucun timer ne vient les révéler par vagues.
    const tiles = useMemo(() => {
        if (!animated) return stage.tiles
        return stage.tiles.map(tile => {
            const placed = { ...tile, justPlaced: true, dropDelay: stage.dropDelays.get(tile.id) }
            const status = statuses[tile.id]
            // `idle` retombe sur le style d'origine : les connecteurs n'ont pas de statut, et
            // agentTileStyle les repeindrait en tuile d'agent.
            if (!status || status === 'idle') return placed
            return { ...placed, style: agentTileStyle(status, tile.ariaLabel ?? '') }
        })
    }, [animated, stage, statuses])

    // La plomberie est posée une fois pour toutes : elle se trace à l'entrée puis reste, courant
    // compris. Un beam n'est monté que le temps qu'il a lieu — c'est ce qui le distingue d'une
    // installation, qu'il relie deux agents ou qu'il se superpose au câble d'un outil pour montrer
    // l'appel qui y passe. Sous prefers-reduced-motion la scène est arrêtée : pas de lien du tout,
    // la comète d'un câble n'ayant pas d'interrupteur.
    const links = useMemo(() => {
        if (!animated) return []
        return stage.links.flatMap(link => {
            const id = stageLinkId(link.source, link.target)
            if (link.variant === 'cable') return [{ ...link, appearDelay: stage.appearDelays.get(id) }]
            return hot.has(id) ? [link] : []
        })
    }, [animated, stage, hot])

    return { stage, tiles, links, statuses, animated }
}
