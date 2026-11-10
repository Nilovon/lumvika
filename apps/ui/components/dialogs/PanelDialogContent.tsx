'use client'

import { DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

// The frame of the dialogs that host a panel rather than a form. Every panel-* primitive is
// `min-h-0 flex-1`, so without a height imposed here they have nothing to measure themselves
// against: a bare DialogContent grows to its content and the inner scrollers never engage.
//
// The `p-0` also drops the safe-area padding the bottom sheet carries under `sm`, so the frame
// pays it back itself: the panels inside scroll to their last row and would otherwise end under
// the home indicator.
//
// Both sizes sit on the content itself rather than on the inner column, so a caller resizes the
// frame with one `className`. The content also drops the grid it is laid out with by default: as a
// flex column its single row cannot be sized by its content, which is what lets the height hold and
// the inner scrollers engage.
export function PanelDialogContent({ className, children, ...props }: ComponentProps<typeof DialogContent>) {
    return (
        <DialogContent
            className={cn('flex flex-col gap-0 overflow-hidden p-0 max-sm:h-[85dvh] sm:h-[min(40rem,88dvh)] sm:max-w-3xl', className)}
            // Without this the frame opens with its first tab focus-ringed, a box drawn around a
            // label that is already underlined as the active one.
            onOpenAutoFocus={event => event.preventDefault()}
            {...props}
        >
            <div className="flex min-h-0 flex-1 flex-col max-sm:pb-[env(safe-area-inset-bottom)]">{children}</div>
        </DialogContent>
    )
}
