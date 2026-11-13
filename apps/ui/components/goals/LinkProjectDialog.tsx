'use client'

import { setProjectGoalAction, type GoalProjectOption } from '@/app/api/_actions/goals.actions'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useErrorText } from '@/hooks/useErrorText'
import { KanbanIcon } from '@/lib/icons'
import type { GoalTreeNode } from '@/lib/work/goal-tree'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

type LinkProjectDialogProps = {
    goal: GoalTreeNode | null
    projects: GoalProjectOption[]
    onOpenChange: (open: boolean) => void
    onLinked: () => void
}

// Linking changes the project, so only the projects the reader manages can be picked; the others stay
// listed, greyed, saying why.
export function LinkProjectDialog({ goal, projects, onOpenChange, onLinked }: LinkProjectDialogProps) {
    const t = useTranslations('goals.link')
    const errorText = useErrorText()
    const [pending, setPending] = useState<string | null>(null)

    const link = async (project: GoalProjectOption) => {
        if (!goal) return
        setPending(project.id)
        const result = await setProjectGoalAction(project.id, goal.id)
        setPending(null)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        toast.success(t('linked', { project: project.name, goal: goal.title }))
        onLinked()
        onOpenChange(false)
    }

    const hintOf = (project: GoalProjectOption) => {
        if (project.goalId === goal?.id) return t('linkedHere')
        if (project.access !== 'manage') return t('manageOnly')
        if (project.goalId) return t('linkedElsewhere')
        return null
    }

    return (
        <Dialog open={!!goal} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
                <DialogHeader className="border-b px-4 py-4">
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{goal ? t('description', { title: goal.title }) : null}</DialogDescription>
                </DialogHeader>
                <Command>
                    <CommandInput placeholder={t('search')} />
                    <CommandList className="max-h-[min(20rem,50dvh)]">
                        <CommandEmpty>{projects.length === 0 ? t('empty') : t('noMatch')}</CommandEmpty>
                        {projects.map(project => {
                            const hint = hintOf(project)
                            const blocked = project.access !== 'manage' || project.goalId === goal?.id || pending !== null
                            return (
                                <CommandItem key={project.id} value={`${project.name} ${project.key}`} disabled={blocked} onSelect={() => void link(project)} className="gap-2 px-3 py-2">
                                    <KanbanIcon className="size-4 text-muted-foreground" />
                                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                                    {hint ? (
                                        <Badge size="xs" tone={project.goalId === goal?.id ? 'green' : 'neutral'} glow={false} className="shrink-0 font-medium">
                                            {hint}
                                        </Badge>
                                    ) : (
                                        <span className="shrink-0 text-xs text-muted-foreground">{project.key}</span>
                                    )}
                                </CommandItem>
                            )
                        })}
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    )
}
