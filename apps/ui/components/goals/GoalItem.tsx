'use client'

import type { GoalTeamOption } from '@/app/api/_actions/goals.actions'
import { GoalProgress } from '@/components/goals/GoalProgress'
import { GoalStatusBadge } from '@/components/goals/GoalStatusBadge'
import { MemberAvatar } from '@/components/teams/MemberAvatar'
import { TeamColorDot } from '@/components/teams/TeamColorDot'
import type { WorkMemberIdentity } from '@/components/teams/useWorkMembers'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CalendarIcon, ChevronDownIcon, ChevronRightIcon, EllipsisIcon, KanbanIcon, PencilIcon, Trash2Icon, XIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { GoalProjectRef, GoalTreeNode } from '@/lib/work/goal-tree'
import { formatDate } from '@lumvika/i18n/format'
import type { WorkMemberRef } from '@lumvika/contracts'
import { PANEL_CARD } from '@lumvika/ui/primitives'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'

export type GoalItemContext = {
    isAdmin: boolean
    teamsById: ReadonlyMap<string, GoalTeamOption>
    identify: (ref: WorkMemberRef) => WorkMemberIdentity
    canUnlink: (projectId: string) => boolean
    onEdit: (goal: GoalTreeNode) => void
    onAddSubGoal: (goal: GoalTreeNode) => void
    onLinkProject: (goal: GoalTreeNode) => void
    onUnlinkProject: (goal: GoalTreeNode, project: GoalProjectRef) => void
    onDelete: (goal: GoalTreeNode) => void
}

export function GoalItem({ goal, context }: { goal: GoalTreeNode; context: GoalItemContext }) {
    const t = useTranslations('goals')
    const locale = useLocale()
    const [open, setOpen] = useState(true)
    const team = goal.teamId ? context.teamsById.get(goal.teamId) : undefined
    const owner = goal.ownerUserId ? context.identify({ kind: 'user', userId: goal.ownerUserId }) : null
    const hasChildren = goal.children.length > 0
    const Chevron = open ? ChevronDownIcon : ChevronRightIcon

    return (
        <li className="space-y-2">
            <div className={cn(PANEL_CARD, 'flex flex-col gap-2.5 p-3 sm:p-4')}>
                <div className="flex min-w-0 items-start gap-1.5">
                    {hasChildren ? (
                        <Button variant="ghost" size="icon-xs" className="mt-px shrink-0 text-muted-foreground" aria-expanded={open} aria-label={open ? t('row.collapse', { title: goal.title }) : t('row.expand', { title: goal.title })} onClick={() => setOpen(value => !value)}>
                            <Chevron />
                        </Button>
                    ) : (
                        <span className="size-6 shrink-0" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 text-sm font-medium break-words">{goal.title}</span>
                        <GoalStatusBadge status={goal.status} />
                    </div>
                    <GoalMenu goal={goal} context={context} />
                </div>
                {goal.description && <p className="line-clamp-2 pl-7.5 text-xs text-muted-foreground">{goal.description}</p>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-7.5 text-xs text-muted-foreground">
                    {owner ? (
                        <span className="flex min-w-0 items-center gap-1.5">
                            <MemberAvatar member={owner} className="size-5" />
                            <span className="truncate text-foreground/80">{owner.isMe ? t('row.you', { name: owner.name }) : owner.name}</span>
                        </span>
                    ) : (
                        <span>{t('row.noOwner')}</span>
                    )}
                    {team && (
                        <span className="flex min-w-0 items-center gap-1.5">
                            <TeamColorDot color={team.color} />
                            <span className="truncate">{team.name}</span>
                        </span>
                    )}
                    {goal.targetDate && (
                        <span className="flex items-center gap-1">
                            <CalendarIcon className="size-3.5" />
                            {t('row.target', { date: formatDate(goal.targetDate, locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) })}
                        </span>
                    )}
                    {hasChildren && <span>{t('row.subGoals', { count: goal.children.length })}</span>}
                </div>
                <div className="pl-7.5">
                    <GoalProgress progress={goal.rollup} />
                </div>
                {goal.projects.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5 pl-7.5">
                        {goal.projects.map(project => (
                            <li key={project.id} className="flex max-w-full items-center gap-1 rounded-md border border-border bg-background py-0.5 pr-0.5 pl-2 text-xs">
                                <KanbanIcon className="size-3.5 shrink-0 text-muted-foreground" />
                                <Link href={`/projects/${project.key}`} className="min-w-0 truncate hover:underline">
                                    {project.name}
                                </Link>
                                <span className="shrink-0 text-muted-foreground">{project.key}</span>
                                {context.canUnlink(project.id) ? (
                                    <Button variant="ghost" size="icon-xs" className="size-5 shrink-0 text-muted-foreground" aria-label={t('row.unlink', { project: project.name })} onClick={() => context.onUnlinkProject(goal, project)}>
                                        <XIcon />
                                    </Button>
                                ) : (
                                    <span className="w-1" />
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {hasChildren && open && (
                <ul className="ml-3 space-y-2 border-l border-border pl-3 sm:ml-4 sm:pl-4">
                    {goal.children.map(child => (
                        <GoalItem key={child.id} goal={child} context={context} />
                    ))}
                </ul>
            )}
        </li>
    )
}

function GoalMenu({ goal, context }: { goal: GoalTreeNode; context: GoalItemContext }) {
    const t = useTranslations('goals')
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="-mt-0.5 shrink-0" aria-label={t('row.actionsFor', { title: goal.title })}>
                    <EllipsisIcon />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
                {context.isAdmin && (
                    <>
                        <DropdownMenuItem className="whitespace-nowrap" onSelect={() => context.onEdit(goal)}>
                            <PencilIcon />
                            {t('actions.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem inset className="whitespace-nowrap" onSelect={() => context.onAddSubGoal(goal)}>
                            {t('actions.addSubGoal')}
                        </DropdownMenuItem>
                    </>
                )}
                <DropdownMenuItem inset={context.isAdmin || undefined} className="whitespace-nowrap" onSelect={() => context.onLinkProject(goal)}>
                    {t('actions.linkProject')}
                </DropdownMenuItem>
                {context.isAdmin && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" className="whitespace-nowrap" onSelect={() => context.onDelete(goal)}>
                            <Trash2Icon />
                            {t('actions.delete')}
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
