'use client'

import { setProjectGoalAction } from '@/app/api/_actions/goals.actions'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { DeleteGoalDialog } from '@/components/goals/DeleteGoalDialog'
import { GoalDialog, type GoalDialogTarget } from '@/components/goals/GoalDialog'
import { GoalItem, type GoalItemContext } from '@/components/goals/GoalItem'
import { GoalsFilters } from '@/components/goals/GoalsFilters'
import { GoalsSkeleton } from '@/components/goals/GoalsSkeleton'
import { LinkProjectDialog } from '@/components/goals/LinkProjectDialog'
import { useGoals } from '@/components/goals/useGoals'
import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { useWorkMembers } from '@/components/teams/useWorkMembers'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TooltipDisabledReason } from '@/components/ui/tooltip'
import { useErrorText } from '@/hooks/useErrorText'
import { PlusIcon } from '@/lib/icons'
import { filterGoalTree, type GoalProjectRef, type GoalTreeNode } from '@/lib/work/goal-tree'
import { useIsWorkspaceAdmin } from '@/supabase/session/SessionProvider'
import type { GoalStatus } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

export function GoalsScreen() {
    const t = useTranslations('goals')
    const errorText = useErrorText()
    const isAdmin = useIsWorkspaceAdmin()
    const { overview, failed, reload } = useGoals()
    const members = useWorkMembers()
    const [statuses, setStatuses] = useState<GoalStatus[]>([])
    const [teamIds, setTeamIds] = useState<string[]>([])
    const [dialog, setDialog] = useState<GoalDialogTarget | null>(null)
    const [linking, setLinking] = useState<GoalTreeNode | null>(null)
    const [deleting, setDeleting] = useState<GoalTreeNode | null>(null)
    const [unlinking, setUnlinking] = useState<{ goal: GoalTreeNode; project: GoalProjectRef } | null>(null)

    const shown = useMemo(() => (overview ? filterGoalTree(overview.goals, { statuses, teamIds }) : []), [overview, statuses, teamIds])
    const manageable = useMemo(() => new Set((overview?.projects ?? []).filter(project => project.access === 'manage').map(project => project.id)), [overview])

    const context: GoalItemContext = {
        isAdmin,
        teamsById: new Map((overview?.teams ?? []).map(team => [team.id, team])),
        identify: members.identify,
        canUnlink: projectId => manageable.has(projectId),
        onEdit: goal => setDialog({ kind: 'edit', goal }),
        onAddSubGoal: goal => setDialog({ kind: 'create', parentGoalId: goal.id }),
        onLinkProject: setLinking,
        onUnlinkProject: (goal, project) => setUnlinking({ goal, project }),
        onDelete: setDeleting,
    }

    const unlink = async () => {
        if (!unlinking) return
        const result = await setProjectGoalAction(unlinking.project.id, null)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        toast.success(t('link.unlinked', { project: unlinking.project.name, goal: unlinking.goal.title }))
        setUnlinking(null)
        void reload()
    }

    const newGoal = (
        <TooltipDisabledReason reason={isAdmin ? undefined : t('adminOnly')} side="bottom">
            <Button size="sm" onClick={() => setDialog({ kind: 'create', parentGoalId: null })} disabled={!isAdmin}>
                <PlusIcon />
                {t('newGoal')}
            </Button>
        </TooltipDisabledReason>
    )

    let body
    if (failed && !overview) {
        body = (
            <EmptyState
                icon={NAV_ICONS.goals}
                title={t('loadFailed')}
                action={
                    <Button size="sm" variant="outline" onClick={() => void reload()}>
                        {t('retry')}
                    </Button>
                }
                className="py-16"
            />
        )
    } else if (!overview) {
        body = <GoalsSkeleton />
    } else if (overview.goals.length === 0) {
        body = (
            <EmptyState
                icon={NAV_ICONS.goals}
                title={t('empty.title')}
                description={t('empty.description')}
                action={
                    isAdmin ? (
                        <Button size="sm" onClick={() => setDialog({ kind: 'create', parentGoalId: null })}>
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
            <div className="space-y-4">
                <GoalsFilters teams={overview.teams} statuses={statuses} onStatusesChange={setStatuses} teamIds={teamIds} onTeamIdsChange={setTeamIds} />
                {shown.length === 0 ? (
                    <EmptyState
                        icon={NAV_ICONS.goals}
                        title={t('noMatch.title')}
                        action={
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    setStatuses([])
                                    setTeamIds([])
                                }}
                            >
                                {t('noMatch.clear')}
                            </Button>
                        }
                        className="py-12"
                    />
                ) : (
                    <ul className="space-y-2">
                        {shown.map(goal => (
                            <GoalItem key={goal.id} goal={goal} context={context} />
                        ))}
                    </ul>
                )}
            </div>
        )
    }

    return (
        <PageFrame title={t('title')} description={t('description')} actions={newGoal}>
            {body}
            <GoalDialog target={dialog} goals={overview?.goals ?? []} teams={overview?.teams ?? []} people={members.people} onOpenChange={open => !open && setDialog(null)} onSaved={() => void reload()} />
            <LinkProjectDialog goal={linking} projects={overview?.projects ?? []} onOpenChange={open => !open && setLinking(null)} onLinked={() => void reload()} />
            <DeleteGoalDialog goal={deleting} onOpenChange={open => !open && setDeleting(null)} onDeleted={() => void reload()} />
            <ConfirmDialog
                open={!!unlinking}
                onOpenChange={open => !open && setUnlinking(null)}
                title={unlinking ? t('link.unlinkTitle', { project: unlinking.project.name }) : ''}
                description={unlinking ? t('link.unlinkDescription', { goal: unlinking.goal.title }) : undefined}
                confirmLabel={t('link.unlinkConfirm')}
                onConfirm={event => {
                    event.preventDefault()
                    void unlink()
                }}
            />
        </PageFrame>
    )
}
