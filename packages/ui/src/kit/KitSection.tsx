import type { ReactNode } from 'react'

import { cn } from '../cn'

export function KitSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
    return (
        <section id={id} className="flex scroll-mt-24 flex-col gap-6 border-t border-divide pt-10 first:border-t-0 first:pt-0">
            <div className="max-w-2xl">
                <h2 className="text-xl font-medium tracking-tight text-foreground">{title}</h2>
                {description && <p className="mt-2 text-sm text-foreground/50">{description}</p>}
            </div>
            {children}
        </section>
    )
}

export function KitBlock({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-4">
            <div>
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                {description && <p className="mt-1 text-sm text-foreground/50">{description}</p>}
            </div>
            {children}
        </div>
    )
}

export function KitRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-6">
            <span className="w-44 shrink-0 font-mono text-xs text-foreground/40">{label}</span>
            <div className="flex flex-wrap items-center gap-4">{children}</div>
        </div>
    )
}

export function KitNote({ children }: { children: ReactNode }) {
    return <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-foreground/60">{children}</p>
}

export function KitGrid({ cols = 3, className, children }: { cols?: 1 | 2 | 3 | 4; className?: string; children: ReactNode }) {
    const columns = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols]
    return <div className={cn('grid gap-4', columns, className)}>{children}</div>
}
