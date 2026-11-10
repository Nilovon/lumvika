'use client'

import type { ComponentProps, ReactNode } from 'react'
import { DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// The house dialog shape: a fixed two column frame, form on the left, illustration or explainer on
// the right. Every create and configure dialog goes through here so they all share one size.
// The remaining DialogContent props pass through, so a dialog nobody may dismiss (the onboarding)
// can still keep this shell rather than hand rolling its own frame beside it.
// One size holds from sm up. Below it the aside is gone and the frame is a bottom sheet, where a
// height of its own would be wrong twice over: it would strand a two field form in the middle of an
// empty screen, and it would not shrink when the keyboard opens, pushing the footer off screen. So
// the sheet is sized by its content and only capped, and the column below shrinks and scrolls.
export function SplitDialogContent({ aside, className, gridClassName, children, ...props }: ComponentProps<typeof DialogContent> & { aside: ReactNode; gridClassName?: string }) {
    return (
        // The footer spans the left column only, so its bottom right corner lands on the divider
        // rather than on an edge of the dialog. Squaring it off leaves the overflow-hidden above to
        // cut the bottom left corner, which is the only one that meets the frame.
        //
        // The width cap carries its own margin: it is a `sm:` utility, so it beats the base
        // `max-w-[calc(100%-2rem)]` of DialogContent from sm up, and a plain `sm:max-w-7xl` would
        // leave the frame edge to edge on a 1280 window.
        <DialogContent className={cn('gap-0 overflow-hidden p-0 sm:max-w-[min(80rem,100%_-_4rem)] [&_[data-slot=dialog-footer]]:rounded-none', className)} {...props}>
            {/* The row is `minmax(0,1fr)` and not the implicit `auto`: a column whose content is
                taller than the frame would otherwise grow the row past it, and the overflow-hidden
                above would cut the bottom of the dialog off. */}
            <div className={cn('flex min-h-0 flex-col sm:grid sm:h-[min(48rem,90dvh)] sm:grid-cols-2 sm:grid-rows-[minmax(0,1fr)]', gridClassName)}>
                {children}
                {aside}
            </div>
        </DialogContent>
    )
}
