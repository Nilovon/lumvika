'use client'

import { TextGenerateEffect } from '@rerun/ui'
import { StepperBar, StepTransition, type StepperGroup, type StepperSplit } from '@rerun/ui/steps'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Header of a multi step dialog: progress bars, then a title and a description that slide with the
// step. Shared so two shells walking the same wizard cannot drift apart visually.
//
// `hero` is for a wizard whose step is nothing but its question: the title is centred and set large
// enough to be the screen rather than its caption. Its block holds a fixed height so a step that
// asks a shorter question does not move whatever is mounted under it.
export function StepDialogHeader({
    count,
    index,
    direction,
    title,
    description,
    split,
    groups,
    stepKey,
    variant = 'compact',
    className,
}: {
    count: number
    index: number
    direction: number
    title?: string
    description?: string
    split?: StepperSplit
    groups?: readonly StepperGroup[]
    stepKey?: string | number
    variant?: 'compact' | 'hero'
    className?: string
}) {
    const hero = variant === 'hero'

    return (
        // Tighter on a phone across the board: the hero block is the whole top of a bottom sheet,
        // and the desktop rhythm there leaves the step under it a strip.
        <DialogHeader className={cn(hero ? 'mb-6 sm:mb-9' : 'mb-4', className)}>
            <StepperBar count={count} current={index} split={split} groups={groups} className={hero ? 'mb-6 sm:mb-10' : 'mb-4'} />
            {/* Kept mounted with nothing in it rather than dropped, so a step that carries its own
                title elsewhere fades the previous one out instead of cutting it. */}
            <StepTransition stepKey={stepKey ?? index} direction={direction} variant="header" className={cn(hero && 'flex min-h-[5.5rem] flex-col items-center gap-2.5 px-4 text-center sm:min-h-[6.75rem]')}>
                {/* The hero title writes itself in word by word: on a step that is nothing but its
                    question, the question arriving is the thing that happens. The transition is
                    keyed on the step, so each new title replays it. */}
                {title && (
                    <DialogTitle className={cn(hero && 'text-2xl leading-tight font-semibold text-balance sm:text-3xl')}>
                        {hero ? <TextGenerateEffect key={title} text={title} duration={0.4} delay={0.12} /> : title}
                    </DialogTitle>
                )}
                {/* DialogDescription rather than a plain <p>: it is what carries the aria-describedby of the content. */}
                {/* The description follows the title in rather than landing with it, and reads as one
                    breath: a sentence three times as long needs a much tighter stagger and a softer
                    blur, or the eye is left waiting on its last words. */}
                {description && (
                    <DialogDescription className={cn(hero && 'max-w-md text-sm text-balance line-clamp-2 sm:text-base')}>
                        {hero ? <TextGenerateEffect key={description} text={description} duration={0.55} delay={0.45} stagger={0.028} blur={5} /> : description}
                    </DialogDescription>
                )}
            </StepTransition>
        </DialogHeader>
    )
}
