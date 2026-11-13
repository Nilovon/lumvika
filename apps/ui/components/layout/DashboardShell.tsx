'use client'

import { BoardChatSplit } from '@/components/layout/BoardChatSplit'
import { DashboardRuntime } from '@/components/layout/DashboardRuntime'
import { AppSidebar } from '@/components/layout/sidebar/AppSidebar'
import { MobileNavDrawer } from '@/components/layout/sidebar/MobileNavDrawer'
import { loadSidebarCollapsed } from '@/lib/shell/sidebar-state'
import type { StewardPlacement } from '@/lib/steward-layout'
import { useShellStore } from '@/stores/shell.store'
import { useSession } from '@/lib/auth/session/SessionProvider'
import { useEffect, type ReactNode } from 'react'

type DashboardShellProps = {
    // The platform flag and whether the request came from an account rather than an anonymous visitor.
    initialShellOpen: boolean
    platform: boolean
    initialSidebarCollapsed: boolean | null
    stewardOpen: boolean | null
    stewardPlacement: StewardPlacement | null
    // Whether the pages folded the Steward column on the last visit (lib/shell/steward-fold).
    stewardFolds: boolean | null
    children: ReactNode
}

/**
 * The frame of every dashboard page: the sidebar (with the platform flag, for an account), the card
 * the page renders into, the Steward's column beside it, and the runtime they all share. The server
 * decided whether the sidebar shows from the request; once the session is known on the client it
 * follows it, so an anonymous visitor who signs up gets the sidebar without a reload.
 */
export function DashboardShell({ initialShellOpen, platform, initialSidebarCollapsed, stewardOpen, stewardPlacement, stewardFolds, children }: DashboardShellProps) {
    const { loading, isAnonymous, workspace } = useSession()
    const storedCollapsed = useShellStore(s => s.sidebarCollapsed)
    const collapsed = storedCollapsed ?? initialSidebarCollapsed ?? false
    const shellOpen = platform && (loading ? initialShellOpen : Boolean(workspace) && !isAnonymous)

    useEffect(() => {
        useShellStore.getState().restoreSidebarCollapsed(loadSidebarCollapsed())
    }, [])

    return (
        <>
            <BoardChatSplit initialOpen={stewardOpen} initialPlacement={stewardPlacement} initialFolds={stewardFolds} sidebar={shellOpen ? { node: <AppSidebar collapsed={collapsed} />, collapsed } : undefined}>
                {children}
                <DashboardRuntime />
            </BoardChatSplit>
            {shellOpen && <MobileNavDrawer />}
        </>
    )
}
