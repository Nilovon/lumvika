'use client'

import { useTranslations } from 'next-intl'

import type { StewardCorner } from '@/lib/steward-layout'
import { XIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { StewardDockBubble } from './StewardDockBubble'

type StewardReplyBubbleProps = {
    corner: StewardCorner
    text: string
    /** The turn ended on an error: the column has what went wrong. */
    failed?: boolean
    onOpen: () => void
    onDismiss: () => void
}

/** The end of a turn run from the pill. The whole of it is one click away, in the column. */
export function StewardReplyBubble({ corner, text, failed = false, onOpen, onDismiss }: StewardReplyBubbleProps) {
    const t = useTranslations('steward.reply')
    return (
        <StewardDockBubble corner={corner} tone={failed ? 'red' : undefined}>
            <button type="button" data-bubble-surface onClick={onOpen} className="flex w-full flex-col gap-1.5 rounded-[inherit] py-3 pr-9 pl-3 text-left transition-colors hover:bg-accent">
                <span className={cn('line-clamp-4 whitespace-pre-line', failed && 'text-destructive')}>{text}</span>
                <span className="text-xs text-muted-foreground">{t('open')}</span>
            </button>
            <button type="button" aria-label={t('dismiss')} onClick={onDismiss} className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <XIcon className="size-3.5" />
            </button>
        </StewardDockBubble>
    )
}
