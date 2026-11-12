'use client'

import { createGoalAction, updateGoalAction, type GoalTeamOption } from '@/app/api/_actions/goals.actions'
import { MemberAvatar } from '@/components/teams/MemberAvatar'
import { TeamColorDot } from '@/components/teams/TeamColorDot'
import type { WorkMemberIdentity } from '@/components/teams/useWorkMembers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useErrorText } from '@/hooks/useErrorText'
import { flattenGoalTree, nestsUnderItself, type GoalTreeNode } from '@/lib/work/goal-tree'
import { GOAL_STATUSES, type GoalStatus } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

const NONE = '__none__'

// What the dialog opens on: a goal to edit, or a new goal, under a parent when it is a sub-goal.
export type GoalDialogTarget = { kind: 'edit'; goal: GoalTreeNode } | { kind: 'create'; parentGoalId: string | null }

type GoalDialogProps = {
    target: GoalDialogTarget | null
    goals: GoalTreeNode[]
    teams: GoalTeamOption[]
    people: WorkMemberIdentity[]
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}

export function GoalDialog({ target, onOpenChange, ...rest }: GoalDialogProps) {
    return <Dialog open={!!target} onOpenChange={onOpenChange}>{target && <GoalForm target={target} onClose={() => onOpenChange(false)} {...rest} />}</Dialog>
}

function GoalForm({ target, goals, teams, people, onClose, onSaved }: Omit<GoalDialogProps, 'target' | 'onOpenChange'> & { target: GoalDialogTarget; onClose: () => void }) {
    const t = useTranslations('goals')
    const errorText = useErrorText()
    const editing = target.kind === 'edit' ? target.goal : null
    const [title, setTitle] = useState(editing?.title ?? '')
    const [description, setDescription] = useState(editing?.description ?? '')
    const [status, setStatus] = useState<GoalStatus>(editing?.status ?? 'planned')
    const [parentId, setParentId] = useState(editing ? (editing.parentGoalId ?? NONE) : target.kind === 'create' ? (target.parentGoalId ?? NONE) : NONE)
    const [teamId, setTeamId] = useState(editing?.teamId ?? NONE)
    const [ownerId, setOwnerId] = useState(editing?.ownerUserId ?? NONE)
    const [targetDate, setTargetDate] = useState(editing?.targetDate ?? '')
    const [saving, setSaving] = useState(false)

    const parents = useMemo(() => {
        const all = flattenGoalTree(goals)
        return all.filter(goal => goal.id !== editing?.id).map(goal => ({ goal, loops: !!editing && nestsUnderItself(all, editing.id, goal.id) }))
    }, [goals, editing])

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        setSaving(true)
        const input = {
            title,
            description: description.trim() || null,
            status,
            parentGoalId: parentId === NONE ? null : parentId,
            teamId: teamId === NONE ? null : teamId,
            ownerUserId: ownerId === NONE ? null : ownerId,
            targetDate: targetDate || null,
        }
        const result = editing ? await updateGoalAction(editing.id, input) : await createGoalAction(input)
        setSaving(false)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        toast.success(editing ? t('dialog.saved') : t('dialog.created'))
        onSaved()
        onClose()
    }

    const heading = editing ? t('dialog.editTitle') : parentId !== NONE ? t('dialog.createSubTitle') : t('dialog.createTitle')

    return (
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <DialogHeader>
                    <DialogTitle>{heading}</DialogTitle>
                    <DialogDescription>{editing ? t('dialog.editDescription') : t('dialog.createDescription')}</DialogDescription>
                </DialogHeader>
                <Input id="goal-title" label={t('dialog.titleLabel')} placeholder={t('dialog.titlePlaceholder')} value={title} onChange={event => setTitle(event.target.value)} maxLength={200} autoFocus required />
                <Textarea id="goal-description" label={t('dialog.descriptionLabel')} optional placeholder={t('dialog.descriptionPlaceholder')} value={description} onChange={event => setDescription(event.target.value)} className="min-h-20" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label={t('dialog.status')} htmlFor="goal-status">
                        <Select value={status} onValueChange={value => setStatus(value as GoalStatus)}>
                            <SelectTrigger id="goal-status" className="w-full data-[size=default]:h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {GOAL_STATUSES.map(value => (
                                    <SelectItem key={value} value={value}>
                                        {t(`status.${value}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('dialog.targetDate')} optional htmlFor="goal-target-date">
                        <DateField id="goal-target-date" value={targetDate || null} onChange={day => setTargetDate(day ?? '')} />
                    </Field>
                </div>
                <Field label={t('dialog.parent')} htmlFor="goal-parent">
                    <Select value={parentId} onValueChange={setParentId}>
                        <SelectTrigger id="goal-parent" className="w-full data-[size=default]:h-10">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            <SelectItem value={NONE}>{t('dialog.noParent')}</SelectItem>
                            {parents.map(({ goal, loops }) => (
                                <SelectItem key={goal.id} value={goal.id} disabled={loops}>
                                    <span className="truncate">{goal.title}</span>
                                    {loops && <span className="truncate text-xs text-muted-foreground">{t('dialog.underItself')}</span>}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label={t('dialog.team')} htmlFor="goal-team">
                        <Select value={teamId} onValueChange={setTeamId}>
                            <SelectTrigger id="goal-team" className="w-full data-[size=default]:h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE}>{t('dialog.noTeam')}</SelectItem>
                                {teams.map(team => (
                                    <SelectItem key={team.id} value={team.id}>
                                        <TeamColorDot color={team.color} />
                                        {team.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('dialog.owner')} htmlFor="goal-owner">
                        <Select value={ownerId} onValueChange={setOwnerId}>
                            <SelectTrigger id="goal-owner" className="w-full data-[size=default]:h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                <SelectItem value={NONE}>{t('dialog.noOwner')}</SelectItem>
                                {people.map(person => (
                                    <SelectItem key={person.key} value={person.ref.kind === 'user' ? person.ref.userId : person.key}>
                                        <MemberAvatar member={person} className="size-5" />
                                        <span className="truncate">{person.isMe ? t('row.you', { name: person.name }) : person.name}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                        {t('dialog.cancel')}
                    </Button>
                    <Button type="submit" loading={saving} disabled={!title.trim()}>
                        {editing ? t('dialog.save') : t('dialog.create')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    )
}
