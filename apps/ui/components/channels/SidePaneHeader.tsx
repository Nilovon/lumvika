'use client'

import { Button } from '@/components/ui/button'
import { ArrowLeftIcon, XIcon } from '@/lib/icons'

// Beside the channel the pane closes; in its place (tablet, phone) it goes back to it.
export function SidePaneHeader({ title, onClose, closeLabel, backLabel }: { title: string; onClose: () => void; closeLabel: string; backLabel: string }) {
    return (
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 @2xl:px-3">
            <Button type="button" variant="ghost" size="icon-sm" className="@5xl:hidden" aria-label={backLabel} onClick={onClose}>
                <ArrowLeftIcon />
            </Button>
            <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{title}</h2>
            <Button type="button" variant="ghost" size="icon-sm" className="hidden @5xl:inline-flex" aria-label={closeLabel} onClick={onClose}>
                <XIcon />
            </Button>
        </header>
    )
}
