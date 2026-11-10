'use client'

import { BillingDialog } from '@lumvika/cloud/billing.client'
import { NotificationPermissionDialog } from '@/components/dialogs/NotificationPermissionDialog'
import { NotificationsDialog } from '@/components/dialogs/NotificationsDialog'
import { ShortcutsDialog } from '@/components/dialogs/ShortcutsDialog'
import { SubscriptionOfferDialog } from '@/components/dialogs/SubscriptionOfferDialog'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useInstallPrompt } from '@/components/pwa/useInstallPrompt'
import { useRewindEnabled } from '@/components/layout/FeatureFlagsProvider'
import { selectHasEntries, selectUnreadCount, useChangelogStore } from '@/stores/changelog.store'
import { useStewardStore } from '@/stores/steward.store'
import { selectHasUnseenLatest, useRewindStore } from '@lumvika/cloud/rewind.client'
import { useShortcutsStore } from '@/stores/shortcuts.store'
import { Badge } from '@lumvika/ui/primitives'
import { BookOpenIcon, CodeIcon, DownloadIcon, HandshakeIcon, InfoIcon, KeyboardIcon, ListTodoIcon, MegaphoneIcon, RewindIcon } from '@/lib/icons'
import { docsUrl, landingUrl, SOURCE_REPO_URL } from '@/lib/site'
import { useTranslations } from 'next-intl'

export function WeeklyRewindMenuItem() {
    const t = useTranslations('layout.menu')
    const rewindEnabled = useRewindEnabled()
    const hasStoredRewind = useRewindStore(s => s.weeks.length > 0)
    const rewindUnseen = useRewindStore(selectHasUnseenLatest)
    const openLatestRewind = useRewindStore(s => s.openLatest)

    if (!rewindEnabled || !hasStoredRewind) return null

    return (
        <DropdownMenuItem onSelect={openLatestRewind} className="gap-2 text-muted-foreground whitespace-nowrap">
            <RewindIcon className="size-4" />
            {t('weeklyRewind')}
            {rewindUnseen && <span className="ml-auto size-2 animate-pulse rounded-full bg-brand" />}
        </DropdownMenuItem>
    )
}

export function WhatsNewMenuItem() {
    const t = useTranslations('layout.menu')
    const hasChangelog = useChangelogStore(selectHasEntries)
    const changelogUnread = useChangelogStore(selectUnreadCount)
    const openChangelog = useChangelogStore(s => s.openAll)

    if (!hasChangelog) return null

    return (
        <DropdownMenuItem onSelect={openChangelog} className="gap-2 text-muted-foreground whitespace-nowrap">
            <MegaphoneIcon className="size-4" />
            {t('whatsNew')}
            {changelogUnread > 0 && (
                <Badge size="xs" tone="brand" glow={false} className="ml-auto">
                    {changelogUnread}
                </Badge>
            )}
        </DropdownMenuItem>
    )
}

export function HelpMenuItems({ onOpenGettingStarted }: { onOpenGettingStarted: () => void }) {
    const t = useTranslations('layout.menu')
    const openShortcuts = useShortcutsStore(s => s.openShortcuts)
    const { canInstall, promptInstall } = useInstallPrompt()
    const gettingStartedAvailable = useStewardStore(s => s.gettingStartedAvailable)

    return (
        <>
            {gettingStartedAvailable && (
                <DropdownMenuItem
                    onSelect={() => {
                        onOpenGettingStarted()
                        useStewardStore.getState().openGettingStarted()
                    }}
                    className="gap-2 text-muted-foreground"
                >
                    <ListTodoIcon className="size-4" />
                    {t('gettingStarted')}
                </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild className="gap-2 text-muted-foreground">
                <a href={docsUrl()} target="_blank" rel="noopener noreferrer">
                    <BookOpenIcon className="size-4" />
                    {t('docs')}
                </a>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openShortcuts()} className="gap-2 text-muted-foreground">
                <KeyboardIcon className="size-4" />
                {t('shortcuts')}
            </DropdownMenuItem>
            {canInstall && (
                <DropdownMenuItem onSelect={promptInstall} className="gap-2 text-muted-foreground">
                    <DownloadIcon className="size-4" />
                    {t('installApp')}
                </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild className="gap-2 text-muted-foreground">
                <a href="/about">
                    <InfoIcon className="size-4" />
                    {t('about')}
                </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2 text-muted-foreground">
                <a href={SOURCE_REPO_URL} target="_blank" rel="noopener noreferrer">
                    <CodeIcon className="size-4" />
                    {t('source')}
                </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 text-muted-foreground">
                <a href={landingUrl('/community/experts')} target="_blank" rel="noopener noreferrer">
                    <HandshakeIcon className="size-4" />
                    {t('hireExpert')}
                </a>
            </DropdownMenuItem>
        </>
    )
}

export function ToolbarDialogs() {
    return (
        <>
            <BillingDialog />
            <NotificationsDialog />
            <NotificationPermissionDialog />
            <SubscriptionOfferDialog />
            <ShortcutsDialog />
        </>
    )
}
