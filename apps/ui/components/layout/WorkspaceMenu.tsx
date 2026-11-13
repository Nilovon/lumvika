'use client'

import { useErrorText } from '@/hooks/useErrorText'
import { accountLabel } from '@/lib/auth/placeholder-email'
import { switchWorkspaceAction } from '@/app/api/_actions/workspace.actions'
import { SERVERS_ENABLED } from '@lumvika/cloud/servers'
import { LUMVIKA_CLOUD } from '@lumvika/cloud/edition'
import { CreditMeter } from '@lumvika/cloud/billing.client'
import { usePaidAppsStore, AppsMenuSection } from '@lumvika/cloud/apps.client'
import { useEnabledPaidApps } from '@/components/layout/FeatureFlagsProvider'
import { ThemeMenuRow } from '@/components/layout/ThemeMenuRow'
import { LanguageMenuRow } from '@/components/layout/LanguageMenuRow'
import { WeeklyRewindMenuItem, WhatsNewMenuItem } from '@/components/layout/ToolbarActions'
import { hasWorkspaceRoleMenus, WorkspaceRoleMenus } from '@/components/layout/WorkspaceRoleMenus'
import { PRICING_ICONS, useWorkspaceIcon } from '@/components/layout/useWorkspaceIcon'
import { WorkspaceLogoImage } from '@lumvika/ui/chrome'
import { Badge } from '@lumvika/ui/primitives'
import { TooltipDisabledReason } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { activeAgentLimitFor, BILLING_ENABLED, isLifetimePlan, isWorkspaceApiEntitled } from '@lumvika/cloud/billing'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useIsTemplateAuthor } from '@/hooks/useIsTemplateAuthor'
import { useLumvikaCredit } from '@/hooks/useLumvikaCredit'
import { useAccountStore } from '@/stores/account.store'
import { useBillingStore } from '@/stores/billing.store'
import { useBrainStore } from '@/stores/brain.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useWorkspaceMenuStore } from '@/stores/workspace-menu.store'
import { useWorkspaceSettingsStore } from '@/stores/workspace-settings.store'
import { useIsWorkspaceAdmin, useSession } from '@/lib/auth/session/SessionProvider'
import { BellIcon, BlocksIcon, BrainIcon, CheckIcon, CreditCardIcon, KeyIcon, LockKeyholeIcon, LogOutIcon, PlusIcon, ServerIcon, SettingsIcon, UserRoundIcon, UsersIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { abortWorkspaceSwitch, beginWorkspaceSwitch, enterActiveWorkspace } from '@/lib/workspace/workspace-switch'
import { Fragment, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

type SessionWorkspace = NonNullable<ReturnType<typeof useSession>['workspace']>

// A menu entry an admin uses and a member sees, disabled, with the reason on hover.
function AdminOnly({ allowed, reason, className = 'flex w-full', children }: { allowed: boolean; reason: string; className?: string; children: ReactNode }) {
    if (allowed) return <>{children}</>
    return (
        <TooltipDisabledReason reason={reason} side="right" className={className}>
            {children}
        </TooltipDisabledReason>
    )
}

type WorkspaceMenuTranslator = ReturnType<typeof useTranslations<'layout.workspaceMenu'>>

function workspaceSummary(workspace: SessionWorkspace, t: WorkspaceMenuTranslator): string {
    if (workspace.is_sandbox) return t('summary.sandbox')
    const trialing = workspace.subscription_status === 'trialing'
    const agents = trialing ? activeAgentLimitFor(workspace.max_agents, workspace.subscription_status) : workspace.max_agents
    const seats = workspace.max_seats == null ? t('summary.unlimitedSeats') : t('summary.seats', { count: workspace.max_seats })
    const limits = agents == null ? t('summary.limitsUnlimited', { seats }) : t('summary.limits', { agents, seats })
    if (trialing) return t('summary.trial', { limits })
    return isLifetimePlan(workspace) ? t('summary.lifetime', { limits }) : limits
}

type WorkspaceMenuProps = {
    // The trigger, rendered as the menu's button: the pill on the board, a row in the sidebar.
    children: ReactNode
    align?: 'start' | 'center' | 'end'
    side?: 'top' | 'right' | 'bottom' | 'left'
}

export function WorkspaceMenu({ children, align = 'start', side = 'bottom' }: WorkspaceMenuProps) {
    const t = useTranslations('layout.workspaceMenu')
    const errorText = useErrorText()
    const { user, workspace, workspaces, session, isAnonymous, signOut } = useSession()
    const openBilling = useBillingStore(s => s.openBilling)
    const paidApps = useEnabledPaidApps()
    const openApp = usePaidAppsStore(s => s.openApp)
    const appAccounts = usePaidAppsStore(s => s.accountCounts)
    const refreshAppAccounts = usePaidAppsStore(s => s.refreshAccountCount)
    const openAccount = useAccountStore(s => s.openAccount)
    const isAdmin = useIsAdmin()
    const workspaceAdmin = useIsWorkspaceAdmin()
    const isTemplateAuthor = useIsTemplateAuthor()
    // Held in a store rather than here: the steward opens these three panels too, from a chat that
    // does not own this menu.
    const openWorkspacePanel = useWorkspaceSettingsStore(s => s.openWorkspacePanel)
    const { setServersOpen, setComposioOpen, setCreateOpen } = useWorkspaceMenuStore()
    const [busy, setBusy] = useState(false)
    const refreshBrainProposals = useBrainStore(s => s.refreshProposalCount)
    // Polled once, by WorkspaceDialogs: the menu has a trigger in several places at a time.
    const brainProposals = useBrainStore(s => s.openProposals)
    const credit = useLumvikaCredit()
    const activeIcon = useWorkspaceIcon()

    const appsInMenu = paidApps.filter(slug => (appAccounts[slug] ?? 0) > 0)

    if (!workspace || isAnonymous) return null

    const isExpert = user?.account_role === 'expert'
    const apiEntitled = isWorkspaceApiEntitled(workspace)
    const regular = workspaces.filter(w => !w.is_sandbox)
    const email = accountLabel(session?.user?.email)

    const sorted = [...regular].sort((a, b) => a.id - b.id)

    async function handleSwitch(workspaceId: number) {
        if (busy || workspaceId === workspace?.id) return
        setBusy(true)
        beginWorkspaceSwitch()
        const result = await switchWorkspaceAction(workspaceId)
        if (result.ok) return enterActiveWorkspace()
        abortWorkspaceSwitch()
        toast.error(errorText(result))
        setBusy(false)
    }

    const trialing = workspace.subscription_status === 'trialing'
    const showCredit = !workspace.is_sandbox && credit.budgetMicros > 0 && workspace.subscription_status !== 'past_due'

    const apiKeysItem = (
        <AdminOnly allowed={workspaceAdmin} reason={t('adminOnly.apiKeys')}>
            <DropdownMenuItem disabled={!workspaceAdmin} onSelect={() => (apiEntitled ? openWorkspacePanel('api_keys') : openBilling(undefined, 'api_keys'))} className="gap-2 text-muted-foreground">
                <KeyIcon className="size-4" />
                {t('apiKeys')}
                {!apiEntitled && (
                    <Badge size="xs" tone="brand" glow={false} className="ml-auto font-medium">
                        PRO
                    </Badge>
                )}
            </DropdownMenuItem>
        </AdminOnly>
    )

    // A sandbox has no settings, members nor billing of its own, but it runs on a machine of its own,
    // so it keeps its providers, its knowledge base and the API key the template tools require.
    const headerSection = (
        <div className="flex flex-col gap-2.5 p-1.5">
            <div className="flex items-center gap-2.5">
                <WorkspaceLogoImage src={workspace.icon_url || activeIcon} fallbackSrc={activeIcon} className="size-8 shrink-0 rounded-full object-cover" />
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{workspace.name || t('defaultName')}</div>
                    <div className="truncate text-xs text-muted-foreground">{workspaceSummary(workspace, t)}</div>
                </div>
            </div>
            {showCredit && (
                <CreditMeter
                    usedMicros={credit.usedMicros}
                    wholeMicros={credit.budgetMicros}
                    trial={trialing}
                    onOpen={() => (workspaceAdmin ? openBilling(undefined, 'workspace_menu') : undefined)}
                    onAdd={workspaceAdmin ? () => openBilling(trialing ? undefined : 'credit_pack', 'workspace_menu') : undefined}
                />
            )}
            {!workspace.is_sandbox && (
                <div className="flex gap-1.5">
                    <AdminOnly allowed={workspaceAdmin} reason={t('adminOnly.settings')} className="flex flex-1">
                        <DropdownMenuItem disabled={!workspaceAdmin} onSelect={() => openWorkspacePanel('workspace')} className="h-7 flex-1 justify-center gap-1.5 rounded-md border border-border text-xs text-foreground">
                            <SettingsIcon className="size-3.5" />
                            {t('settings')}
                        </DropdownMenuItem>
                    </AdminOnly>
                    <DropdownMenuItem onSelect={() => openWorkspacePanel('members')} className="h-7 flex-1 justify-center gap-1.5 rounded-md border border-border text-xs text-foreground">
                        <UsersIcon className="size-3.5" />
                        {t('members')}
                    </DropdownMenuItem>
                </div>
            )}
        </div>
    )

    const workspaceItemsSection = (
        <>
            <DropdownMenuItem onSelect={() => openWorkspacePanel('knowledge_base')} className="gap-2 text-muted-foreground">
                <BrainIcon className="size-4" />
                {t('brain')}
                {brainProposals > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white tabular-nums" aria-label={t('brainProposals', { count: brainProposals })}>
                        {brainProposals}
                    </span>
                )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openWorkspacePanel('ai_providers')} className="gap-2 text-muted-foreground">
                <LockKeyholeIcon className="size-4" />
                {t('aiProviders')}
            </DropdownMenuItem>
            {apiKeysItem}
            {SERVERS_ENABLED && (
                <AdminOnly allowed={workspaceAdmin} reason={t('adminOnly.servers')}>
                    <DropdownMenuItem disabled={!workspaceAdmin} onSelect={() => setServersOpen(true)} className="gap-2 text-muted-foreground">
                        <ServerIcon className="size-4" />
                        {t('servers')}
                    </DropdownMenuItem>
                </AdminOnly>
            )}
            {/* Instance-wide, unlike everything above: the people of ADMIN_EMAILS, on a self-hosted install. */}
            {!LUMVIKA_CLOUD && isAdmin && (
                <DropdownMenuItem onSelect={() => setComposioOpen(true)} className="gap-2 text-muted-foreground">
                    <BlocksIcon className="size-4" />
                    {t('composio')}
                </DropdownMenuItem>
            )}
            {BILLING_ENABLED && !workspace.is_sandbox && (
                <AdminOnly allowed={workspaceAdmin} reason={t('adminOnly.billing')}>
                    <DropdownMenuItem disabled={!workspaceAdmin} onSelect={() => openBilling()} className="gap-2 text-muted-foreground">
                        <CreditCardIcon className="size-4" />
                        {t('billing')}
                    </DropdownMenuItem>
                </AdminOnly>
            )}
            <WhatsNewMenuItem />
            <WeeklyRewindMenuItem />
            {!workspace.is_sandbox && appsInMenu.length > 0 && <AppsMenuSection apps={appsInMenu} onOpen={slug => openApp(slug)} />}
        </>
    )

    const workspacesSection = (
        <>
            {email && <DropdownMenuLabel className="truncate pl-7.5 text-xs font-normal text-muted-foreground">{email}</DropdownMenuLabel>}
            {sorted.map((w, index) => {
                const active = w.id === workspace.id
                const fallbackIcon = PRICING_ICONS[index % PRICING_ICONS.length]
                return (
                    <DropdownMenuItem key={w.id} disabled={busy} onSelect={() => handleSwitch(w.id)} className={cn('gap-2', !active && 'text-muted-foreground')}>
                        <WorkspaceLogoImage src={w.icon_url || fallbackIcon} fallbackSrc={fallbackIcon} className="size-5 shrink-0 rounded-full object-cover" />
                        <span className="flex-1 truncate">{w.name || t('defaultName')}</span>
                        {active && <CheckIcon className="size-4" />}
                    </DropdownMenuItem>
                )
            })}
            <DropdownMenuItem onSelect={() => setCreateOpen(true)} className="gap-2 text-muted-foreground">
                <PlusIcon className="size-4" />
                {t('newWorkspace')}
            </DropdownMenuItem>
        </>
    )

    const roles = { templateAuthor: isTemplateAuthor, expert: isExpert, lumvikaAdmin: isAdmin }
    const rolesSection = hasWorkspaceRoleMenus(roles) && <WorkspaceRoleMenus {...roles} switching={busy} />

    const footerSection = (
        <>
            <ThemeMenuRow />
            <LanguageMenuRow />
            <DropdownMenuItem onSelect={() => useNotificationsStore.getState().openNotifications()} className="gap-2 text-muted-foreground">
                <BellIcon className="size-4" />
                {t('notifications')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openAccount()} className="gap-2 text-muted-foreground">
                <UserRoundIcon className="size-4" />
                {t('account')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={signOut} className="gap-2 text-muted-foreground">
                <LogOutIcon className="size-4" />
                {t('signOut')}
            </DropdownMenuItem>
        </>
    )

    // From the workspace and what runs on it, to switching away from it, to the person using it.
    const sections = [headerSection, workspaceItemsSection, workspacesSection, rolesSection, footerSection].filter(Boolean)

    return (
        <DropdownMenu
            onOpenChange={open => {
                if (!open) return
                void refreshBrainProposals()
                if (!workspace.is_sandbox) for (const slug of paidApps) refreshAppAccounts(slug).catch(() => {})
            }}
        >
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent align={align} side={side} className="w-64 max-h-[calc(100dvh-5rem)] overflow-y-auto">
                {sections.map((section, index) => (
                    <Fragment key={index}>
                        {index > 0 && <DropdownMenuSeparator />}
                        {section}
                    </Fragment>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
