'use client'

import * as React from 'react'

import { cn } from '../cn'
import { BorderBeam } from '../BorderBeam'

const SegmentedControlContext = React.createContext<{ value: string; onValueChange: (value: string) => void } | null>(null)

function SegmentedControl({ value, onValueChange, className, children, ...props }: React.ComponentProps<'div'> & { value: string; onValueChange: (value: string) => void }) {
    return (
        <SegmentedControlContext.Provider value={{ value, onValueChange }}>
            <div data-slot="segmented-control" className={cn('relative inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-border bg-card/80 p-1 shadow-2xl backdrop-blur-md', className)} {...props}>
                <BorderBeam pattern="arcs" tone="white" animated={false} glow angle={53} className="opacity-30" />
                {children}
            </div>
        </SegmentedControlContext.Provider>
    )
}

function SegmentedControlItem({ value, className, children, ...props }: React.ComponentProps<'button'> & { value: string }) {
    const ctx = React.useContext(SegmentedControlContext)
    if (!ctx) throw new Error('SegmentedControlItem must be used within SegmentedControl')
    const active = ctx.value === value
    return (
        <button type="button" data-slot="segmented-control-item" data-state={active ? 'active' : 'inactive'} onClick={() => ctx.onValueChange(value)} className={cn('relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors', active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground', className)} {...props}>
            {active && <BorderBeam animated pattern="arcs" tone="white" glow duration={11} />}
            {children}
        </button>
    )
}

export { SegmentedControl, SegmentedControlItem }
