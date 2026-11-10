'use client'

import { BorderBeam } from '../BorderBeam'
import { Check } from '../icons'

export type OptionMarkProps = { index: number; selected: boolean; multi: boolean }

export function OptionMark({ index, selected, multi }: OptionMarkProps) {
    if (!multi)
        return (
            <span data-selected={selected} className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold tabular-nums text-muted-foreground data-[selected=true]:border-foreground data-[selected=true]:bg-foreground data-[selected=true]:text-background">
                {index + 1}
            </span>
        )

    return (
        <span className="flex size-7 shrink-0 items-center justify-center">
            <span data-selected={selected} className="group relative flex size-6 items-center justify-center rounded-md border border-border bg-transparent transition-colors data-[selected=true]:bg-foreground/15 data-[selected=true]:shadow-[0_0_3px_0_rgba(255,255,255,0.12)]">
                <BorderBeam animated tone="white" pattern="arcs" radius="6px" className="-inset-px! opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
                {selected && <Check className="relative size-4 text-foreground" />}
            </span>
        </span>
    )
}
