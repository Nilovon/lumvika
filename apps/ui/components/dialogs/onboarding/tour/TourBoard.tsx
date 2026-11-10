'use client'

import { cn } from '@/lib/utils'
import { STEP_TRANSITION } from '@rerun/ui/steps'
import { TourScene } from '@rerun/ui/tour'
import { motion } from 'motion/react'

// The board the tour is told on. Mounted once for the whole step and never keyed on the slide: it is
// the one thing that has to survive the walk, so it lives beside the step transition rather than
// inside it. Only the words cross-fade.
//
// Crossing into and out of the tour is the one moment the board itself moves, and it fades on the
// step transition's own timing: the caller keeps it in an AnimatePresence so the exit has time to
// play instead of cutting to black under words that are still sliding.
//
// The scene itself is TourScene, shared with the Box dialogs and with the landing. What is left here
// is what belongs to this dialog and to nothing else: the fade, and the band the header takes.

// The board fills the whole step, bled into the dialog's padding, and the header is laid over it.
// That band is what the header takes from its top edge: the padding it bleeds into (24px), the
// stepper bar with its caption and its margin (78px with the header's own gap), then the title
// block (min-h-[6.75rem]). The board owns it on both ends, the scene it keeps clear and the scrim
// the words are read on, so the two cannot drift apart.
// Measured on both frames rather than deduced: the header is tighter on a phone, where it stops
// 196px in, so the desktop band clears it there too and one constant holds for both.
const TITLE_BAND = 210
// A scrim over the grid, not a mask on it: the words sit on the dialog's own surface at the very
// top and the scene comes back under them, so the header reads as laid on the board rather than as
// a board that stops short of it. Colours are mixed rather than run to `transparent` so the ramp
// does not dip through grey on the way out.
const TITLE_SCRIM = `linear-gradient(to bottom, var(--popover) 0px, color-mix(in oklab, var(--popover) 76%, transparent) 96px, color-mix(in oklab, var(--popover) 0%, transparent) ${TITLE_BAND}px)`

export function TourBoard({ phase, active, className }: { phase: number; active: boolean; className?: string }) {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={STEP_TRANSITION} className={cn('relative', className)}>
            <TourScene phase={phase} active={active} bandTop={TITLE_BAND} className="size-full" />
            <div style={{ height: TITLE_BAND, backgroundImage: TITLE_SCRIM }} className="pointer-events-none absolute inset-x-0 top-0" />
        </motion.div>
    )
}
