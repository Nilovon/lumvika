import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CrispChat } from '@lumvika/cloud/support'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { FeatureFlagsProvider } from '@/components/layout/FeatureFlagsProvider'
import { WorkspaceSwitchLoader } from '@/components/layout/WorkspaceSwitchLoader'
import { paidAppFlags } from '@lumvika/cloud/apps.server'
import { startBackgroundSchedules } from '@lumvika/cloud/tasks'
import { computerFlag, i18nFlag, platformFlag, publishedAccessFlag, rewindFlag } from '@/flags'
import { platformShellOpen } from '@/lib/shell/platform-access'
import { readSignedInAccount } from '@/lib/shell/platform-access.server'
import { SIDEBAR_COOKIE, parseSidebarCollapsed } from '@/lib/shell/sidebar-state'
import { STEWARD_FOLD_COOKIE, parseStewardFolds } from '@/lib/shell/steward-fold'
import { STEWARD_PLACEMENT_COOKIE, parseStewardPlacement } from '@/lib/steward-layout'
import { STEWARD_OPEN_COOKIE, parseStewardOpen } from '@/lib/steward-open'
import { SessionProvider } from '@/supabase/session/SessionProvider'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('layout.dashboard')
    return { title: t('metaTitle'), description: t('metaDescription') }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    // Once per server process, on the first board anyone opens: the crons a self-hosted app runs itself.
    startBackgroundSchedules()
    const [rewind, computer, published, i18n, platform, apps] = await Promise.all([rewindFlag(), computerFlag(), publishedAccessFlag(), i18nFlag(), platformFlag(), paidAppFlags()])
    const signedIn = platform && (await readSignedInAccount())
    // Les miroirs des préférences de la colonne et de la sidebar, pour les rendre déjà à leur place.
    const cookieStore = await cookies()
    const stewardOpen = parseStewardOpen(cookieStore.get(STEWARD_OPEN_COOKIE)?.value)
    const stewardPlacement = parseStewardPlacement(cookieStore.get(STEWARD_PLACEMENT_COOKIE)?.value)
    const sidebarCollapsed = parseSidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value)
    const stewardFolds = parseStewardFolds(cookieStore.get(STEWARD_FOLD_COOKIE)?.value)

    return (
        <SessionProvider>
            <FeatureFlagsProvider rewind={rewind} computer={computer} published={published} i18n={i18n} platform={platform} apps={apps}>
                <DashboardShell initialShellOpen={platformShellOpen({ platform, signedIn })} platform={platform} initialSidebarCollapsed={sidebarCollapsed} stewardOpen={stewardOpen} stewardPlacement={stewardPlacement} stewardFolds={stewardFolds}>
                    {children}
                </DashboardShell>
                <CrispChat hideLauncher position="left" />
                <WorkspaceSwitchLoader />
            </FeatureFlagsProvider>
        </SessionProvider>
    )
}
