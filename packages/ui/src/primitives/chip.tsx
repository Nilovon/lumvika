import type { ReactNode } from 'react'
import { cn } from '../cn'

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors', selected ? 'bg-foreground text-background' : 'bg-muted/30 text-muted-foreground hover:bg-muted/60')}>
            {children}
        </button>
    )
}
