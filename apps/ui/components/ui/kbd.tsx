import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
    return <kbd className={cn('inline-flex min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground shadow-sm', className)}>{children}</kbd>
}
