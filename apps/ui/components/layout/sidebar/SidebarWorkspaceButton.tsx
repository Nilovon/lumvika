'use client'

import { railHidden, type SidebarMode } from '@/components/layout/sidebar/SidebarRow'
import { useWorkspaceIcon } from '@/components/layout/useWorkspaceIcon'
import { ChevronsUpDownIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { useBrainStore } from '@/stores/brain.store'
import { useSession } from '@/supabase/session/SessionProvider'
import { Stripes } from '@lumvika/ui/primitives'
import { WorkspaceLogoImage } from '@lumvika/ui/chrome'
import { useTranslations } from 'next-intl'
import type { ComponentProps } from 'react'

// The trigger of the workspace menu at the top of the sidebar: the board's workspace pill, laid flat.
// Every prop goes to the button, which the menu renders as its trigger.
export function SidebarWorkspaceButton({ mode, className, ...props }: ComponentProps<'button'> & { mode: SidebarMode }) {
    const t = useTranslations('layout.workspaceMenu')
    const { workspace } = useSession()
    const activeIcon = useWorkspaceIcon()
    const brainProposals = useBrainStore(s => s.openProposals)
    const name = workspace?.name || t('defaultName')

    return (
        <button
            type="button"
            aria-label={name}
            className={cn(
                'relative flex h-10 w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg px-[10px] text-sm font-medium whitespace-nowrap text-foreground outline-none transition-colors hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-background/60',
                className
            )}
            {...props}
        >
            {workspace?.is_sandbox && <Stripes className="rounded-lg" color="color-mix(in oklab, var(--foreground) 6%, transparent)" />}
            <span className="relative shrink-0">
                <WorkspaceLogoImage src={workspace?.icon_url || activeIcon} fallbackSrc={activeIcon} className="size-6 rounded-full object-cover" />
                {brainProposals > 0 && <span className="pointer-events-none absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500 ring-2 ring-frame" />}
            </span>
            <span className={cn('relative min-w-0 flex-1 truncate text-left transition-opacity duration-150', railHidden(mode))}>{name}</span>
            <ChevronsUpDownIcon className={cn('relative size-4 shrink-0 text-muted-foreground transition-opacity duration-150', railHidden(mode))} />
        </button>
    )
}
