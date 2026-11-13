'use client'

import { PageFrame } from '@/components/layout/PageFrame'
import { OrgChartPanel } from '@/components/teams/org/OrgChartPanel'
import { TeamsGridSkeleton, TeamsPanel } from '@/components/teams/TeamsPanel'
import { TeamsTabs, type TeamsTab } from '@/components/teams/TeamsTabs'
import { Button } from '@/components/ui/button'
import { TooltipDisabledReason } from '@/components/ui/tooltip'
import { PlusIcon } from '@/lib/icons'
import { useIsWorkspaceAdmin } from '@/lib/auth/session/SessionProvider'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

export function TeamsScreen() {
    return (
        <Suspense fallback={<TeamsScreenFallback />}>
            <TeamsScreenView />
        </Suspense>
    )
}

function TeamsScreenFallback() {
    const t = useTranslations('teams')
    return (
        <PageFrame title={t('title')} description={t('description')}>
            <TeamsGridSkeleton />
        </PageFrame>
    )
}

function TeamsScreenView() {
    const t = useTranslations('teams')
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const isAdmin = useIsWorkspaceAdmin()
    const [creating, setCreating] = useState(false)
    const tab: TeamsTab = searchParams.get('tab') === 'org' ? 'org' : 'teams'

    const changeTab = (next: TeamsTab) => router.replace(next === 'org' ? `${pathname}?tab=org` : pathname, { scroll: false })

    const actions =
        tab === 'teams' ? (
            <TooltipDisabledReason reason={isAdmin ? undefined : t('adminOnly')} side="bottom">
                <Button size="sm" onClick={() => setCreating(true)} disabled={!isAdmin}>
                    <PlusIcon />
                    {t('newTeam')}
                </Button>
            </TooltipDisabledReason>
        ) : undefined

    return (
        <PageFrame title={t('title')} description={t('description')} actions={actions} tabs={<TeamsTabs value={tab} onChange={changeTab} />}>
            {tab === 'teams' ? <TeamsPanel creating={creating} onCreatingChange={setCreating} /> : <OrgChartPanel />}
        </PageFrame>
    )
}
