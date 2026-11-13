'use client'

import { TooltipLabeled } from '@/components/ui/tooltip'
import type { LucideIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

// `rail`: icons only, collapsed by the person. `full`: icons and labels (the phone drawer). `auto`:
// expanded by the person, which a desktop honours from `lg` up; below it a tablet keeps the rail,
// since beside a docked Steward column it has no room for labels. CSS decides, so nothing flashes.
export type SidebarMode = 'rail' | 'full' | 'auto'

/** What hides a label, a heading or a hint when the sidebar is a rail. */
export function railHidden(mode: SidebarMode): string {
    if (mode === 'rail') return 'opacity-0'
    return mode === 'auto' ? 'max-lg:opacity-0' : ''
}

// The sidebar sits on the frame, outside the content card: the active row is a small plate of the
// card's own surface. The icon keeps its place whether the sidebar is a rail or not, so collapsing
// only hides the labels.
const ROW = 'flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg px-[13px] text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50'
const ROW_IDLE = 'text-muted-foreground hover:bg-background/60 hover:text-foreground data-[state=open]:bg-background/60 data-[state=open]:text-foreground'
const ROW_ACTIVE = 'bg-background font-medium text-foreground shadow-xs'

type RowContentProps = { icon: LucideIcon; label: string; mode: SidebarMode; trailing?: ReactNode }

function RowContent({ icon: Glyph, label, mode, trailing }: RowContentProps) {
    return (
        <>
            <Glyph className="size-4 shrink-0" />
            <span className={cn('min-w-0 flex-1 truncate text-left transition-opacity duration-150', railHidden(mode))}>{label}</span>
            {trailing && mode !== 'rail' && <span className={cn('shrink-0', mode === 'auto' && 'max-lg:hidden')}>{trailing}</span>}
        </>
    )
}

function RailTooltip({ mode, label, children }: { mode: SidebarMode; label: string; children: ReactNode }) {
    if (mode !== 'rail') return children
    return (
        <TooltipLabeled label={label} side="right">
            {children}
        </TooltipLabeled>
    )
}

export function SidebarLink({ href, active, onNavigate, ...content }: RowContentProps & { href: string; active: boolean; onNavigate?: () => void }) {
    return (
        <RailTooltip mode={content.mode} label={content.label}>
            <Link href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}>
                <RowContent {...content} />
            </Link>
        </RailTooltip>
    )
}

export function SidebarButton({ icon, label, mode, trailing, className, ...props }: RowContentProps & ComponentProps<'button'>) {
    return (
        <RailTooltip mode={mode} label={label}>
            <button type="button" className={cn(ROW, ROW_IDLE, className)} {...props}>
                <RowContent icon={icon} label={label} mode={mode} trailing={trailing} />
            </button>
        </RailTooltip>
    )
}
