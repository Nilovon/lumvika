'use client'

import { memo } from 'react'
import { DEFAULT_SPAN, TILE_H, TILE_W } from '../iso'

type BeamRingProps = {
    box: { left: number; top: number; width: number; height: number }
    zIndex: number
    color?: string
    // Footprint de la tile ciblée (1, 2, 3…). Défaut DEFAULT_SPAN pour reproduire l'agent 2×2.
    span?: number
}

// Border animée affichée autour d'une tile sélectionnée (et du ghost de placement) :
// un faisceau qui tourne en boucle le long du contour du losange.
export const BeamRing = memo(function BeamRing({ box, zIndex, color = 'var(--iso-outline-hot)', span = DEFAULT_SPAN }: BeamRingProps) {
    const AW = span * TILE_W
    const AH = span * TILE_H

    const diamondPath = `M ${AW / 2} 0 L ${AW} ${AH / 2} L ${AW / 2} ${AH} L 0 ${AH / 2} Z`

    return (
        <svg
            className="absolute pointer-events-none"
            style={{
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
                zIndex,
                overflow: 'visible',
            }}
            viewBox={`0 0 ${AW} ${AH}`}
        >
            <path d={diamondPath} fill="none" style={{ stroke: 'rgb(var(--iso-glint) / 0.15)' }} strokeWidth="0.5" />
            {/* Halo : blur CSS plutôt qu'un <feGaussianBlur>, que le faisceau animé forcerait à re-rasteriser à chaque frame.
                Le faisceau est une animation CSS et non SMIL : seule la cascade peut le mettre en pause (data-iso-paused).
                pathLength normalisé à 1 (cf. iso-space-draw) : le dash se règle sans jamais mesurer le périmètre. */}
            <path d={diamondPath} pathLength={1} className="iso-beam-run" fill="none" style={{ stroke: color, filter: 'blur(1.5px)' }} strokeWidth="1.5" strokeDasharray="0.3 0.7" />
            <path d={diamondPath} pathLength={1} className="iso-beam-run" fill="none" style={{ stroke: color }} strokeWidth="0.8" strokeDasharray="0.3 0.7" />
        </svg>
    )
})
