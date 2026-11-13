'use client'

import { HelpMenu } from '@/components/layout/HelpButton'
import { WorkspaceMenu } from '@/components/layout/WorkspaceMenu'
import { SidebarNav } from '@/components/layout/sidebar/SidebarNav'
import { SidebarButton, railHidden, type SidebarMode } from '@/components/layout/sidebar/SidebarRow'
import { SidebarWorkspaceButton } from '@/components/layout/sidebar/SidebarWorkspaceButton'
import { Skeleton } from '@/components/ui/skeleton'
import { useModKeyLabel } from '@/hooks/useModKeyLabel'
import { HelpCircleIcon, PanelLeftCloseIcon, PanelLeftIcon, SearchIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { useControlCenterStore } from '@/stores/control-center.store'
import { useShellStore } from '@/stores/shell.store'
import { useSession } from '@/lib/auth/session/SessionProvider'
import { UpgradePill } from '@lumvika/cloud/billing.client'
import { useTranslations } from 'next-intl'

type SidebarContentsProps = {
    mode: SidebarMode
    // Absent in the drawer, which closes instead of collapsing.
    collapsible?: boolean
    onNavigate?: () => void
}

/** What the sidebar holds, shared by the desktop column and the phone drawer. */
export function SidebarContents({ mode, collapsible = false, onNavigate }: SidebarContentsProps) {
    const t = useTranslations('layout.nav')
    const mod = useModKeyLabel()
    const { workspace } = useSession()
    const rail = mode === 'rail'

    const openSearch = () => {
        onNavigate?.()
        useControlCenterStore.getState().openControlCenter()
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            {workspace ? (
                <WorkspaceMenu align="start" side="bottom">
                    <SidebarWorkspaceButton mode={mode} />
                </WorkspaceMenu>
            ) : (
                <WorkspaceButtonSkeleton mode={mode} />
            )}
            <SidebarButton icon={SearchIcon} label={t('search')} mode={mode} onClick={openSearch} trailing={<span className="text-xs text-muted-foreground/80">{mod === '⌘' ? '⌘F' : 'Ctrl F'}</span>} />
            <div className="-mx-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 pt-2 [scrollbar-width:thin]">
                <SidebarNav mode={mode} onNavigate={onNavigate} />
            </div>
            <div className="flex flex-col gap-0.5">
                {!rail && (
                    <div className={cn('flex empty:hidden [&>*]:max-w-full', mode === 'auto' && 'max-lg:hidden')}>
                        <UpgradePill />
                    </div>
                )}
                <HelpMenu side={rail ? 'right' : 'top'} tooltip={false}>
                    <SidebarButton icon={HelpCircleIcon} label={t('help')} mode={mode} />
                </HelpMenu>
                {/* Below `lg` the sidebar is a rail whatever the preference: nothing to toggle there. */}
                {collapsible && (
                    <SidebarButton
                        icon={rail ? PanelLeftIcon : PanelLeftCloseIcon}
                        label={rail ? t('expand') : t('collapse')}
                        mode={mode}
                        onClick={() => useShellStore.getState().setSidebarCollapsed(!rail)}
                        className="max-lg:hidden"
                    />
                )}
            </div>
        </div>
    )
}

// The workspace row while the session loads, at its geometry, so the list under it does not move.
function WorkspaceButtonSkeleton({ mode }: { mode: SidebarMode }) {
    return (
        <div aria-hidden className="flex h-10 items-center gap-2 px-[10px]">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <Skeleton className={cn('h-3.5 w-28', railHidden(mode))} />
        </div>
    )
}
