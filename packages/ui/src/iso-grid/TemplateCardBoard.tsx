'use client'

import type { TemplateConnector } from '@lumvika/contracts'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { CARD_HEIGHT, CARD_MAX_ZOOM, CARD_WIDTH } from './card-capture'
import { type BoardAgent, TemplateBoardPreview } from './TemplateBoardPreview'

// The live twin of the captured thumbnail: the same board, at the same framing, drawing itself.
//
// Sharing CARD_MAX_ZOOM with the capture is not enough on its own. TemplateBoardPreview fits the
// board to the box it is given and only then clips the zoom to that ceiling, so a card-sized box
// would fit the board far tighter than the 1200x630 capture ever does and the swap would jump. The
// board is therefore laid out at the capture's exact pixel size and scaled down as a whole, which is
// what the stored PNG is: every tile, label and floor line then lands where the image had it.
//
// maxZoom is overridable for the surfaces that are not a card: the default ceiling is calibrated on
// what a template ships, and a board of one agent and one connector hits it and fills the frame.
export function TemplateCardBoard({ agents, connectors, maxZoom = CARD_MAX_ZOOM }: { agents: BoardAgent[]; connectors: TemplateConnector[]; maxZoom?: number }) {
    const { ref, scale } = useCaptureScale()

    return (
        <motion.div
            aria-hidden
            ref={ref}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            // Opaque, and on the capture's own background: it has to cover the thumbnail underneath
            // rather than blend with it, or the board would be drawn twice during the crossfade.
            className="absolute inset-0 overflow-hidden bg-[#fafafa] dark:bg-[#0a0a0a]"
        >
            {scale !== null && (
                <div
                    className="absolute left-1/2 top-1/2"
                    style={{ width: CARD_WIDTH, height: CARD_HEIGHT, transform: `translate(-50%, -50%) scale(${scale})` }}
                >
                    <TemplateBoardPreview alive agents={agents} connectors={connectors} maxZoom={maxZoom} className="size-full" />
                </div>
            )}
        </motion.div>
    )
}

// How much the capture-sized stage has to shrink to sit inside this frame, fitted the way the image
// it replaces is: the smaller of the two ratios, so a slot taller than 1200x630 letterboxes the
// board instead of cropping it. Null until measured: the stage is nine hundred pixels wider than a
// card, and one frame at scale 1 would paint over it.
function useCaptureScale() {
    const ref = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState<number | null>(null)

    useEffect(() => {
        const element = ref.current
        if (!element) return
        const measure = () => {
            if (element.clientWidth > 0 && element.clientHeight > 0) {
                setScale(Math.min(element.clientWidth / CARD_WIDTH, element.clientHeight / CARD_HEIGHT))
            }
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    return { ref, scale }
}
