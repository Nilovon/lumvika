'use client'

import type { TemplateConnector } from '@rerun/contracts'
import { useMemo } from 'react'

import { cn } from '../cn'
import { IsoGrid } from './IsoGrid'
import { useLivingBoard } from './hooks/useLivingBoard'
import { useOnScreen } from './hooks/useOnScreen'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { useRenderedFrame } from './hooks/useRenderedFrame'
import { agentTileStyle } from './presets'
import { type BoardAgent, buildTemplateBoard, frameTemplateBoard, templateLinkId } from './template-board-geometry'

export type { BoardAgent } from './template-board-geometry'

// Default ceiling is IsoGrid's own desktop zoom: a one-agent board fills its canvas at a tile scale
// the product already uses elsewhere, instead of turning into a handful of huge diamonds. It is
// calibrated for a tall slot next to a block of text (the OG card); a surface that gives the board
// the whole frame, like a card thumbnail, raises it or the board floats in an empty grid.
const DEFAULT_MAX_ZOOM = 1.8

export function TemplateBoardPreview({
    agents,
    connectors,
    className,
    maxZoom = DEFAULT_MAX_ZOOM,
    alive = false,
    highlightedConnectorSlugs,
}: {
    agents: BoardAgent[]
    connectors: TemplateConnector[]
    className?: string
    maxZoom?: number
    // Connecteurs mis en avant : leur tuile porte un halo qui respire. Un slug cité ici mais absent
    // du board (non placé faute de place, ou pas dans les connecteurs d'un agent) est simplement
    // ignoré. Défaut: aucun.
    highlightedConnectorSlugs?: readonly string[]
    // Fait vivre le board : il se pose en cascade, puis chaque agent change d'état à son propre
    // rythme et allume un de ses câbles quand il travaille. Coûteux en rendus, donc réservé aux
    // surfaces éphémères (survol) — une vignette capturée ou un panneau permanent le laisse à false.
    alive?: boolean
}) {
    const { ref, frame } = useRenderedFrame()
    const reducedMotion = usePrefersReducedMotion()
    const animated = alive && !reducedMotion
    const onScreen = useOnScreen(ref)

    // Mémoïsé sur le contenu et non sur la référence : un appelant qui écrit sa liste en littéral
    // inline reconstruirait sinon toute la géométrie à chaque render, et la cascade d'entrée
    // repartirait de zéro sous ses propres pieds.
    const highlightedKey = [...(highlightedConnectorSlugs ?? [])].sort().join(',')
    const geometry = useMemo(() => buildTemplateBoard(agents, connectors, new Set(highlightedKey ? highlightedKey.split(',') : [])), [agents, connectors, highlightedKey])
    const { statuses, hotLinks } = useLivingBoard({
        agentKeys: geometry.agentKeys,
        linkIdsByAgent: geometry.linkIdsByAgent,
        startDelays: geometry.wakeDelays,
        enabled: animated,
        paused: !onScreen,
    })

    // La cascade d'entrée est entièrement portée par le CSS (dropDelay / appearDelay) : toutes les
    // tiles sont montées d'emblée, aucun timer ne vient les révéler par vagues.
    const tiles = useMemo(() => {
        if (!animated) return geometry.tiles
        return geometry.tiles.map(tile => {
            const status = statuses[tile.id]
            const placed = { ...tile, justPlaced: true, dropDelay: geometry.dropDelays.get(tile.id) }
            return status ? { ...placed, style: agentTileStyle(status, tile.ariaLabel ?? '') } : placed
        })
    }, [animated, geometry, statuses])

    const links = useMemo(() => {
        if (!animated) return geometry.links
        // Un câble par agent qui travaille, pas un seul pour tout le board : plusieurs courants en
        // même temps, c'est ce qui raconte que ça bosse en parallèle.
        const hot = new Set(Object.values(hotLinks).filter((id): id is string => id !== null))
        return geometry.links.map(link => {
            const id = templateLinkId(link.source, link.target)
            return { ...link, appearDelay: geometry.appearDelays.get(id), variant: hot.has(id) ? ('beam' as const) : link.variant }
        })
    }, [animated, geometry, hotLinks])

    if (geometry.agentCount === 0) return null

    // IsoGrid reads its initial camera once, on mount, so the grid waits for the measurement rather
    // than mounting at the wrong zoom and being remounted. The frame is computed on the geometry and
    // never on the animated tiles, so the cascade never moves the camera under itself.
    const camera = frame ? frameTemplateBoard(geometry.tiles, frame, maxZoom) : null

    return (
        <div ref={ref} className={cn('relative overflow-hidden', className)}>
            {camera && (
                <IsoGrid
                    tiles={tiles}
                    containers={[]}
                    liveLinks={links}
                    initialPan={camera.pan}
                    initialZoomDesktop={camera.zoom}
                    initialZoomMobile={camera.zoom}
                    scrollGestures={false}
                    canDraw={false}
                />
            )}
        </div>
    )
}
