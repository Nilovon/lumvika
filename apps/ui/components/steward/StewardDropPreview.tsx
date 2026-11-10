'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { FLOAT_CORNER_CLASSES, FLOAT_SIZE_CLASSES, floatSizeStyle } from '@/components/steward/placement-classes'
import type { StewardPlacement } from '@/lib/steward-layout'
import { cn } from '@/lib/utils'
import { useStewardStore } from '@/stores/steward.store'

/** Les bandes de dock reprennent la piste moins la gouttière `md:p-2` qui la borde côté board. */
function targetClasses(target: StewardPlacement): string {
    if (target.mode === 'dock') return cn('md:inset-y-2 md:w-[calc(var(--steward-dock-track)-8px)]', target.side === 'left' ? 'md:left-2' : 'md:right-2')
    return cn(FLOAT_SIZE_CLASSES, FLOAT_CORNER_CLASSES[target.corner])
}

/** Le fantôme de la place où la colonne tenue par son en-tête atterrira si on la lâche. */
export function StewardDropPreview() {
    const target = useStewardStore(state => state.dropTarget)
    const reduceMotion = useReducedMotion()

    return (
        <AnimatePresence>
            {target && (
                <motion.div
                    aria-hidden
                    layout={!reduceMotion}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
                    style={{ ...(target.mode === 'float' ? floatSizeStyle(target) : null), borderRadius: 14 }}
                    className={cn('pointer-events-none fixed z-40 hidden border-2 border-primary/40 bg-primary/5 md:block', targetClasses(target))}
                />
            )}
        </AnimatePresence>
    )
}
