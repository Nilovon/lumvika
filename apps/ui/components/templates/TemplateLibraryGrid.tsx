'use client'

import { TemplateLibraryEmpty } from '@/components/templates/TemplateLibraryEmpty'
import { TemplateTile } from '@/components/templates/TemplateTile'
import type { LibraryTemplate } from '@/lib/templates/library'
import { LEAVING, LIBRARY_EASE, LIBRARY_SETTLE, SETTLE_FROM, SETTLED } from '@/lib/templates/motion'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

// Cards land one after the other, but the tail is capped: at this step a filter that lets thirty
// templates through would take more than a second to finish drawing itself.
const STAGGER_STEP = 0.04
const MAX_STAGGERED = 12

export function TemplateLibraryGrid({
    templates,
    selectedSlug,
    showStatus,
    onSelectTemplate,
    empty,
    filtered,
    revealKey,
    onScratch,
}: {
    templates: LibraryTemplate[]
    selectedSlug: string | null
    showStatus: (template: LibraryTemplate) => boolean
    onSelectTemplate: (slug: string) => void
    empty: boolean
    // Whether anything is narrowing the catalogue, which is what the empty block says out loud. An
    // empty catalogue with no filter on it must not claim the filters are to blame.
    filtered: boolean
    // The dimensions worth replaying the whole landing for. Deliberately not the search text: that
    // one changes on every keystroke, and re-staggering the grid under a typing cursor is the
    // opposite of settled. Under a search, cards leave and arrive one by one instead.
    revealKey: string
    onScratch?: () => void
}) {
    const reduceMotion = useReducedMotion() ?? false

    const cells = (
        // relative because popLayout takes a leaving card out of the flow and positions it
        // absolutely for the length of its fade. The columns follow the column the grid sits in, not
        // the window: the detail panel opening beside it takes 420px away.
        <div className="relative grid grid-cols-1 gap-x-5 gap-y-8 @min-[28rem]:grid-cols-2 @min-[46rem]:grid-cols-3 @min-[62rem]:grid-cols-4">
            <AnimatePresence mode="popLayout">
                {templates.map((template, index) => (
                    <GridCell key={template.slug} reduceMotion={reduceMotion} delay={Math.min(index, MAX_STAGGERED) * STAGGER_STEP}>
                        <TemplateTile className="h-full w-full" template={template} selected={selectedSlug === template.slug} showStatus={showStatus(template)} onSelect={() => onSelectTemplate(template.slug)} />
                    </GridCell>
                ))}
                {empty && (
                    <GridCell key="empty" reduceMotion={reduceMotion} delay={0} className="col-span-full">
                        <TemplateLibraryEmpty filtered={filtered} onScratch={onScratch} />
                    </GridCell>
                )}
            </AnimatePresence>
        </div>
    )

    if (reduceMotion) return cells

    // Picking a category or a connector replaces the answer rather than trimming it, so the grid
    // dissolves and the new one lands whole. The cards inside keep their own presence for what a
    // search does to them one at a time.
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div key={revealKey} exit={{ opacity: 0, filter: 'blur(4px)', transition: { duration: 0.16, ease: LIBRARY_EASE } }}>
                {cells}
            </motion.div>
        </AnimatePresence>
    )
}

// The card no longer is the grid item, this wrapper is, so it carries the stretch the cards of one
// row need to share a height.
function GridCell({ reduceMotion, delay, className, children }: { reduceMotion: boolean; delay: number; className?: string; children: ReactNode }) {
    return (
        <motion.div
            // "position" and not the full layout animation: every cell is the same size, so only the
            // position ever changes, and translating alone spares the cover and the text a stretch.
            layout={reduceMotion ? false : 'position'}
            initial={reduceMotion ? false : SETTLE_FROM}
            // The delay rides on the enter target rather than on `transition`, which the layout
            // reflow reads too: a reflow that waited its turn would tear the grid apart.
            animate={{ ...SETTLED, transition: { ...LIBRARY_SETTLE, delay: reduceMotion ? 0 : delay } }}
            exit={reduceMotion ? { opacity: 0 } : LEAVING}
            transition={LIBRARY_SETTLE}
            className={cn('min-w-0', className)}
        >
            {children}
        </motion.div>
    )
}
