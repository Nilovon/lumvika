import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { ReactNode } from 'react'

// A block of the overview: a title, an optional link to the full screen, and its content.
export function OverviewCard({ title, description, link, action, children, className }: { title: string; description?: string; link?: { href: string; label: string }; action?: ReactNode; children: ReactNode; className?: string }) {
    const headingId = `overview-${title.replace(/\W+/g, '-').toLowerCase()}`
    return (
        <section aria-labelledby={headingId} className={cn('@container flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4', className)}>
            <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                    <h2 id={headingId} className="text-sm font-medium text-foreground">
                        {title}
                    </h2>
                    {description && <p className="text-xs text-muted-foreground">{description}</p>}
                </div>
                {action}
                {link && (
                    <Link href={link.href} className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                        {link.label}
                    </Link>
                )}
            </header>
            {children}
        </section>
    )
}
