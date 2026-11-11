import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CrispChat } from '@lumvika/cloud/support'
import { BoardChatSplit } from '@/components/layout/BoardChatSplit'
import { FeatureFlagsProvider } from '@/components/layout/FeatureFlagsProvider'
import { WorkspaceSwitchLoader } from '@/components/layout/WorkspaceSwitchLoader'
import { paidAppFlags } from '@lumvika/cloud/apps.server'
import { startBackgroundSchedules } from '@lumvika/cloud/tasks'
import { computerFlag, i18nFlag, publishedAccessFlag, rewindFlag } from '@/flags'
import { STEWARD_PLACEMENT_COOKIE, parseStewardPlacement } from '@/lib/steward-layout'
import { STEWARD_OPEN_COOKIE, parseStewardOpen } from '@/lib/steward-open'
import { SessionProvider } from '@/lib/auth/session/SessionProvider'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('layout.dashboard')
    return { title: t('metaTitle'), description: t('metaDescription') }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    // Once per server process, on the first board anyone opens: the crons a self-hosted app runs itself.
    startBackgroundSchedules()
    const [rewind, computer, published, i18n, apps] = await Promise.all([rewindFlag(), computerFlag(), publishedAccessFlag(), i18nFlag(), paidAppFlags()])
    // Les miroirs des préférences de la colonne, ouverture et placement, pour la rendre déjà à sa place.
    const cookieStore = await cookies()
    const stewardOpen = parseStewardOpen(cookieStore.get(STEWARD_OPEN_COOKIE)?.value)
    const stewardPlacement = parseStewardPlacement(cookieStore.get(STEWARD_PLACEMENT_COOKIE)?.value)

    return (
        <SessionProvider>
            <FeatureFlagsProvider rewind={rewind} computer={computer} published={published} i18n={i18n} apps={apps}>
                <BoardChatSplit initialOpen={stewardOpen} initialPlacement={stewardPlacement}>{children}</BoardChatSplit>
                <CrispChat hideLauncher position="left" />
                <WorkspaceSwitchLoader />
            </FeatureFlagsProvider>
        </SessionProvider>
    )
}
