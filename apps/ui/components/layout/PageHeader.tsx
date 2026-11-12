import { MobileNavButton } from '@/components/layout/sidebar/MobileNavButton'
import { Button } from '@/components/ui/button'
import { ArrowLeftIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { ReactNode } from 'react'

export type PageHeaderBack = { href: string; label: string }

export type PageHeaderProps = {
    title: ReactNode
    description?: ReactNode
    leading?: ReactNode
    back?: PageHeaderBack
    actions?: ReactNode
    tabs?: ReactNode
    className?: string
}

export function PageHeader({ title, description, leading, back, actions, tabs, className }: PageHeaderProps) {
    return (
        <header className={cn('shrink-0 border-b border-border', className)}>
            {/* On a narrow card the actions wrap under the title rather than squeezing it. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-6 md:py-4">
                <div className="flex min-w-[min(14rem,100%)] flex-1 items-center gap-2">
                    <MobileNavButton variant="plain" />
                    {back && (
                        <Button asChild variant="ghost" size="icon-sm" className="-ml-1 shrink-0 text-muted-foreground">
                            <Link href={back.href} aria-label={back.label} title={back.label}>
                                <ArrowLeftIcon className="size-4" />
                            </Link>
                        </Button>
                    )}
                    {leading && <div className="flex shrink-0 items-center">{leading}</div>}
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate font-heading text-base leading-tight font-medium text-foreground">{title}</h1>
                        {description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground md:truncate">{description}</p>}
                    </div>
                </div>
                {actions && <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">{actions}</div>}
            </div>
            {tabs && <div className="-mb-px overflow-x-auto px-2 [scrollbar-width:none] md:px-4 [&::-webkit-scrollbar]:hidden">{tabs}</div>}
        </header>
    )
}
