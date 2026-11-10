'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ModelPill } from '../beams'

import type { TourModelPill } from './tour-models'

// The badges of the subscription slide, laid over the world layer of the grid so they pan and zoom
// with the board. Two nested elements, same reason as CursorOverlay: the outer one holds the anchor
// and the counter-scale that keeps the pill the same size on screen whatever the camera does, the
// inner one owns the entrance. Put both on one node and the counter-scale fights the pop.
//
// The badge is centred with the CSS `translate` property and not with a transform: motion owns
// `transform` on both nodes, and a Tailwind -translate-x-1/2 there would simply be overwritten.
const ENTER = { duration: 0.36, ease: [0.22, 1, 0.36, 1] as const }
const LEAVE = { duration: 0.3, ease: [0.4, 0, 1, 1] as const }

export function TourModelPills({ pills, zoom }: { pills: readonly TourModelPill[]; zoom: number }) {
    return (
        <AnimatePresence>
            {pills.map(pill => (
                <motion.div
                    key={pill.key}
                    aria-hidden
                    style={{ position: 'absolute', left: pill.x, top: pill.y, translate: '-50% -50%', transformOrigin: '50% 50%', pointerEvents: 'none', zIndex: 999000 }}
                    animate={{ scale: 1 / zoom }}
                    transition={{ duration: 0.15 }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.86, y: 10, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transition: ENTER }}
                        exit={{ opacity: 0, scale: 0.94, y: -12, filter: 'blur(3px)', transition: LEAVE }}
                    >
                        <ModelPill item={pill.item} />
                    </motion.div>
                </motion.div>
            ))}
        </AnimatePresence>
    )
}
