'use client'

import { cn } from '@/lib/utils'

export function ChangelogDots({ count, current }: { count: number; current: number }) {
    if (count < 2) return null
    return (
        <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: count }, (_, index) => (
                <span key={index} className={cn('h-1.5 rounded-full transition-[width,background-color] duration-300', index === current ? 'w-5 bg-foreground' : 'w-1.5 bg-foreground/20')} />
            ))}
        </div>
    )
}
