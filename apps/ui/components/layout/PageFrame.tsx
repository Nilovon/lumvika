import { PageHeader, type PageHeaderProps } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export type PageFrameWidth = 'full' | 'readable'

export type PageFrameProps = Omit<PageHeaderProps, 'className'> & {
    children: ReactNode
    width?: PageFrameWidth
    bleed?: boolean
    bodyClassName?: string
}

const WIDTHS: Record<PageFrameWidth, string> = {
    full: 'max-w-none',
    readable: 'max-w-3xl',
}

// Every area of the platform renders inside this frame, in the dashboard's content card: a header
// that stays put, a body that scrolls under it. `bleed` hands the whole body to a view that lays
// itself out and scrolls itself (a board, a split list and detail, a chat). The body keeps room at
// its end for the Steward's orb, parked over the bottom corner of the card.
export function PageFrame({ children, width = 'full', bleed = false, bodyClassName, ...header }: PageFrameProps) {
    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            <PageHeader {...header} />
            {bleed ? (
                <main className={cn('relative min-h-0 flex-1 overflow-hidden', bodyClassName)}>{children}</main>
            ) : (
                <main className="min-h-0 flex-1 overflow-y-auto">
                    <div className={cn('mx-auto w-full px-4 pt-4 pb-24 md:px-6 md:pt-6', WIDTHS[width], bodyClassName)}>{children}</div>
                </main>
            )}
        </div>
    )
}
