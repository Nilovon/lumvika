import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function OverviewSection({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
    return (
        <section className={cn('flex flex-col gap-3 rounded-lg border border-border p-4', className)}>
            <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-medium">{title}</h2>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            {children}
        </section>
    )
}
