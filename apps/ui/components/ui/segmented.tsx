'use client'

import { cn } from '@/lib/utils'
import type { LucideIcon } from '@/lib/icons'
import type { ReactNode } from 'react'

type SegmentedOption<T extends string> = { value: T; label: string; icon?: LucideIcon; content?: ReactNode }

export function Segmented<T extends string>({ options, value, onChange, className }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
    return (
        <div className={cn('flex gap-1', className)}>
            {options.map(o => {
                const active = value === o.value
                const OptionIcon = o.icon
                return (
                    <button
                        key={o.value}
                        type="button"
                        aria-pressed={active}
                        aria-label={o.label}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-[12px] font-medium transition-colors',
                            'text-muted-foreground hover:text-foreground hover:border-foreground/20',
                            active && 'border-primary/40 text-primary ring-1 ring-primary/40',
                        )}
                    >
                        {OptionIcon ? <OptionIcon className="size-4" /> : (o.content ?? o.label)}
                    </button>
                )
            })}
        </div>
    )
}
