'use client'

import { Checkbox } from '@/components/ui/checkbox'
import type { CaptureSourceAgent } from '@/lib/templates/capture'
import { cn } from '@/lib/utils'

export function CaptureAgentRow({ agent, checked, onToggle }: { agent: CaptureSourceAgent; checked: boolean; onToggle: () => void }) {
    return (
        <label
            className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-2 transition-colors hover:bg-foreground/5',
                checked && 'border-primary/40 bg-primary/5',
            )}
        >
            <Checkbox size="sm" checked={checked} onCheckedChange={onToggle} />

            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{agent.name}</span>
                <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
                    {agent.handle && <span className="shrink-0">@{agent.handle}</span>}
                    {agent.description && <span className="truncate">{agent.description}</span>}
                </span>
            </span>
        </label>
    )
}
