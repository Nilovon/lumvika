import type { ReactNode } from 'react'

export function DetailBlock({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
                {aside}
            </div>
            {children}
        </section>
    )
}
