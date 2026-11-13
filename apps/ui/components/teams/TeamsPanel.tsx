'use client'

import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { TeamCard } from '@/components/teams/TeamCard'
import { TeamDetailDialog } from '@/components/teams/TeamDetailDialog'
import { TeamDialog } from '@/components/teams/TeamDialog'
import { useTeams } from '@/components/teams/useTeams'
import { useWorkMembers } from '@/components/teams/useWorkMembers'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PlusIcon } from '@/lib/icons'
import { PANEL_CARD } from '@lumvika/ui/primitives'
import { useIsWorkspaceAdmin } from '@/lib/auth/session/SessionProvider'
import type { Team } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'

export function TeamsPanel({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (open: boolean) => void }) {
    const t = useTranslations('teams')
    const isAdmin = useIsWorkspaceAdmin()
    const { teams, failed, reload, applyTeam, dropTeam } = useTeams()
    const members = useWorkMembers()
    const [openTeamId, setOpenTeamId] = useState<string | null>(null)
    const openTeam = teams?.find(team => team.id === openTeamId) ?? null

    const created = (team: Team) => {
        applyTeam(team)
        setOpenTeamId(team.id)
    }

    let body
    if (failed && !teams) {
        body = (
            <EmptyState
                icon={NAV_ICONS.teams}
                title={t('loadFailed')}
                action={
                    <Button size="sm" variant="outline" onClick={() => void reload()}>
                        {t('retry')}
                    </Button>
                }
                className="py-16"
            />
        )
    } else if (!teams) {
        body = <TeamsGridSkeleton />
    } else if (teams.length === 0) {
        body = (
            <EmptyState
                icon={NAV_ICONS.teams}
                title={t('empty.title')}
                description={t('empty.description')}
                action={
                    isAdmin ? (
                        <Button size="sm" onClick={() => onCreatingChange(true)}>
                            <PlusIcon />
                            {t('empty.action')}
                        </Button>
                    ) : (
                        <p className="max-w-[36ch] text-xs text-muted-foreground">{t('empty.askAdmin')}</p>
                    )
                }
                className="py-16"
            />
        )
    } else {
        body = (
            <div className={GRID}>
                {teams.map(team => (
                    <TeamCard key={team.id} team={team} identify={members.identify} onOpen={() => setOpenTeamId(team.id)} />
                ))}
            </div>
        )
    }

    return (
        <>
            {body}
            <TeamDialog open={creating} onOpenChange={onCreatingChange} onSaved={created} />
            <TeamDetailDialog
                team={openTeam}
                members={members}
                onOpenChange={open => !open && setOpenTeamId(null)}
                onChanged={applyTeam}
                onDeleted={teamId => {
                    setOpenTeamId(null)
                    dropTeam(teamId)
                }}
            />
        </>
    )
}

export function TeamsGridSkeleton() {
    return (
        <div className={GRID}>
            {[0, 1, 2].map(index => (
                <div key={index} className={`${PANEL_CARD} flex flex-col gap-3 p-4`}>
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-2.5 rounded-full" />
                        <Skeleton className="h-3.5" style={{ width: `${[40, 55, 35][index]}%` }} />
                    </div>
                    <Skeleton className="h-3 w-4/5" />
                    <div className="flex items-center justify-between">
                        <div className="flex -space-x-1.5">
                            {[0, 1, 2].map(avatar => (
                                <Skeleton key={avatar} className="size-6 rounded-full" />
                            ))}
                        </div>
                        <Skeleton className="h-3 w-16" />
                    </div>
                </div>
            ))}
        </div>
    )
}
