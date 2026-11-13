'use client'

import { ComposioDialog } from '@/components/composio/ComposioDialog'
import { AccountDialog } from '@/components/dialogs/AccountDialog'
import { AiProvidersDialog } from '@/components/dialogs/AiProvidersDialog'
import { ApiKeysDialog } from '@/components/dialogs/ApiKeysDialog'
import { CreateWorkspaceDialog } from '@/components/dialogs/CreateWorkspaceDialog'
import { ExpertProfileDialog } from '@/components/dialogs/ExpertProfileDialog'
import { KnowledgeBaseDialog } from '@/components/dialogs/KnowledgeBaseDialog'
import { ServersDialog } from '@/components/dialogs/ServersDialog'
import { WorkspaceMembersDialog } from '@/components/dialogs/WorkspaceMembersDialog'
import { WorkspaceSettingsDialog } from '@/components/dialogs/WorkspaceSettingsDialog'
import { useEnabledPaidApps } from '@/components/layout/FeatureFlagsProvider'
import { WorkspacePowerDialog } from '@/components/layout/WorkspacePowerControl'
import { useWorkspaceIcon } from '@/components/layout/useWorkspaceIcon'
import { useBrainProposalCount } from '@/hooks/useBrainProposalCount'
import { PaidAppDialogs, usePaidAppsStore } from '@lumvika/cloud/apps.client'
import { SERVERS_ENABLED } from '@lumvika/cloud/servers'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { LUMVIKA_CLOUD } from '@lumvika/cloud/edition'
import { useWorkspaceMenuStore } from '@/stores/workspace-menu.store'
import { useWorkspaceSettingsStore } from '@/stores/workspace-settings.store'
import { useSession } from '@/lib/auth/session/SessionProvider'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

/**
 * What the workspace menu opens, mounted once for every page of the dashboard, plus the two counts
 * its rows carry (Brain proposals, the accounts of each paid app), read here so that a menu with a
 * trigger in the sidebar and another on the board does not poll twice.
 */
export function WorkspaceDialogs() {
    const { user, workspace, isAnonymous } = useSession()
    const paidApps = useEnabledPaidApps()
    const appsRevision = usePaidAppsStore(s => s.revision)
    const refreshAppAccounts = usePaidAppsStore(s => s.refreshAccountCount)
    const panel = useWorkspaceSettingsStore(s => s.panel)
    const setPanel = useWorkspaceSettingsStore(s => s.setPanel)
    const { createOpen, serversOpen, composioOpen, profileOpen, powerAction, setCreateOpen, setServersOpen, setComposioOpen, setProfileOpen, setPowerAction } = useWorkspaceMenuStore()
    const isAdmin = useIsAdmin()
    const activeIcon = useWorkspaceIcon()
    // The team invite email links straight to this dialog. Read rather than mirrored into state, and
    // closing drops the param so a refresh does not reopen it.
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const membersLinked = searchParams.get('members') === '1'

    useBrainProposalCount(Boolean(workspace) && !isAnonymous)

    // An app joins the Apps section of the menu with its first account: counted on mount and again
    // each time a dialog connects or removes one.
    const sandbox = workspace?.is_sandbox ?? true
    useEffect(() => {
        if (sandbox) return
        for (const slug of paidApps) refreshAppAccounts(slug).catch(() => {})
    }, [paidApps, sandbox, appsRevision, refreshAppAccounts])

    if (!workspace || isAnonymous) return null

    return (
        <>
            <AccountDialog />
            <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
            <WorkspaceSettingsDialog open={panel === 'workspace'} onOpenChange={open => setPanel(open ? 'workspace' : null)} fallbackIconUrl={activeIcon} />
            <WorkspaceMembersDialog
                open={panel === 'members' || membersLinked}
                onOpenChange={open => {
                    setPanel(open ? 'members' : null)
                    if (!open && membersLinked) router.replace(pathname, { scroll: false })
                }}
            />
            <ApiKeysDialog open={panel === 'api_keys'} onOpenChange={open => setPanel(open ? 'api_keys' : null)} />
            {SERVERS_ENABLED && <ServersDialog open={serversOpen} onOpenChange={setServersOpen} />}
            {!LUMVIKA_CLOUD && isAdmin && <ComposioDialog open={composioOpen} onOpenChange={setComposioOpen} />}
            <AiProvidersDialog open={panel === 'ai_providers'} onOpenChange={open => setPanel(open ? 'ai_providers' : null)} />
            <KnowledgeBaseDialog open={panel === 'knowledge_base'} onOpenChange={open => setPanel(open ? 'knowledge_base' : null)} />
            <PaidAppDialogs apps={paidApps} />
            <WorkspacePowerDialog action={powerAction} onOpenChange={open => setPowerAction(open ? powerAction : null)} />
            {user?.account_role === 'expert' && <ExpertProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />}
        </>
    )
}
