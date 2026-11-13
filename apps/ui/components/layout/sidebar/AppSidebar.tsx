'use client'

import { SidebarContents } from '@/components/layout/sidebar/SidebarContents'
import { cn } from '@/lib/utils'
import { useReducedMotion } from 'motion/react'

// The desktop column, on the frame left of the content card: 44px as a rail, 232px expanded, which
// only `lg` and up honour. BoardChatSplit offsets the Steward's fixed layers by the same widths
// (`--shell-sidebar-w`, plus the 8px gap). `collapsed` comes resolved from the shell (cookie first,
// then the person's toggle), so the server renders it at its final width.
export function AppSidebar({ collapsed }: { collapsed: boolean }) {
    const reduceMotion = useReducedMotion()
    return (
        <aside
            data-app-sidebar
            data-collapsed={collapsed}
            className={cn('hidden h-full w-11 shrink-0 overflow-hidden py-1 md:block', !collapsed && 'lg:w-58', !reduceMotion && 'transition-[width] duration-200 ease-in-out')}
        >
            <SidebarContents mode={collapsed ? 'rail' : 'auto'} collapsible />
        </aside>
    )
}
