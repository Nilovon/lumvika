'use client'

import { UpgradePill } from '@lumvika/cloud/billing.client'
import { usePlatformEnabled } from '@/components/layout/FeatureFlagsProvider'
import { HelpButton } from '@/components/layout/HelpButton'
import { SignInPillButton } from '@/components/layout/SignInPill'
import { WorkspaceMenu } from '@/components/layout/WorkspaceMenu'
import { useWorkspaceIcon } from '@/components/layout/useWorkspaceIcon'
import { MobileNavButton } from '@/components/layout/sidebar/MobileNavButton'
import { WorkspacePill } from '@lumvika/ui/chrome'
import { cn } from '@/lib/utils'
import { useBrainStore } from '@/stores/brain.store'
import { useStewardStore } from '@/stores/steward.store'
import { useSession } from '@/lib/auth/session/SessionProvider'
import { useTranslations } from 'next-intl'

/**
 * The board's top-left corner: the workspace pill, help and the upgrade pill. With the platform shell
 * the sidebar holds all three from `md` up, so the corner only stays on a phone, behind the button
 * that opens the navigation drawer.
 */
export function WorkspaceSwitcher() {
    const t = useTranslations('layout.workspaceMenu')
    const { workspace, isAnonymous } = useSession()
    const platform = usePlatformEnabled()
    const guided = useStewardStore(state => state.funnel === 'guided')
    const brainProposals = useBrainStore(s => s.openProposals)
    const activeIcon = useWorkspaceIcon()

    if (!workspace) return null

    // A returning user on a fresh browser lands here anonymous: an empty board under "My workspace"
    // reads as a lost account, so this corner is where the way back in sits. On a phone the funnel's
    // sheet cannot be closed and carries its own sign-in, so the pill would only crowd the board.
    if (isAnonymous) {
        return (
            <div className={cn('absolute top-4 left-4 z-40', guided && 'max-md:hidden')}>
                <SignInPillButton />
            </div>
        )
    }

    return (
        // Leaves room for the view controls in the top-right corner: on a phone the workspace name
        // truncates rather than pushing the row under them.
        <div className={cn('absolute top-4 left-4 z-40 flex max-w-[calc(100%-2*var(--chrome-edge)-var(--chrome-size)-var(--chrome-gap))] items-center gap-2', platform && 'md:hidden')}>
            {platform && <MobileNavButton />}
            <div className="relative min-w-0">
                <WorkspaceMenu>
                    <WorkspacePill className="max-w-full shrink" name={workspace.name || t('defaultName')} iconUrl={workspace.icon_url || activeIcon} fallbackIconUrl={activeIcon} stripes={workspace.is_sandbox} />
                </WorkspaceMenu>
                {brainProposals > 0 && <span className="pointer-events-none absolute top-0.5 right-0.5 size-2 rounded-full bg-red-500 ring-2 ring-card" />}
            </div>
            <HelpButton />
            <UpgradePill />
        </div>
    )
}
