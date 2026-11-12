'use client'

import { AssigneePicker } from '@/components/issues/AssigneePicker'
import { IssuePriorityPicker } from '@/components/issues/IssuePriorityPicker'
import { IssueRunsNotice } from '@/components/issues/IssueRunsNotice'
import { IssueStatusBadge } from '@/components/issues/IssueStatusBadge'
import { BOARD_STATUSES } from '@/components/issues/issue-status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { DateField } from '@/components/ui/date-field'
import { Input } from '@/components/ui/input'
import { MarkdownTextarea } from '@/components/ui/markdown-textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CreateIssueInput, IssuePriority, IssueStatus, IssueSummary, WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'

// A new issue starts in the workflow or before it, never already closed.
const CREATE_STATUSES = BOARD_STATUSES.filter(status => status !== 'done' && status !== 'cancelled' && status !== 'blocked')
// The statuses in which an assigned coworker is woken as soon as the issue is created.
const STARTS_AT_ONCE = new Set<IssueStatus>(['todo', 'in_progress'])

export type NewIssueDialogProps = {
    projectId: string
    projectName: string
    // A coworker assigned in a restricted project shows its work to whoever may use it: the form says so.
    projectRestricted?: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
    // Resolves with the issue once written, or null when the server refused it (it says why itself).
    onCreate: (input: CreateIssueInput) => Promise<IssueSummary | null>
    defaultStatus?: IssueStatus
}

export function NewIssueDialog({ open, onOpenChange, ...props }: NewIssueDialogProps) {
    return <Dialog open={open} onOpenChange={onOpenChange}>{open && <NewIssueForm {...props} onClose={() => onOpenChange(false)} />}</Dialog>
}

function NewIssueForm({ projectId, projectName, projectRestricted, onCreate, defaultStatus = 'todo', onClose }: Omit<NewIssueDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
    const t = useTranslations('issues.create')
    const tCommon = useTranslations('common')
    const tAssignee = useTranslations('issues.assignee')
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [status, setStatus] = useState<IssueStatus>(defaultStatus)
    const [priority, setPriority] = useState<IssuePriority>('none')
    const [assignee, setAssignee] = useState<WorkMemberRef | null>(null)
    const [dueDate, setDueDate] = useState('')
    const [saving, setSaving] = useState(false)

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (!title.trim() || saving) return
        setSaving(true)
        const created = await onCreate({ projectId, title: title.trim(), description: description.trim() || null, status, priority, assignee, dueDate: dueDate || null })
        setSaving(false)
        if (created) onClose()
    }

    return (
        <DialogContent className="sm:max-w-xl">
            <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description', { project: projectName })}</DialogDescription>
                </DialogHeader>
                <Input id="issue-title" label={t('titleLabel')} value={title} onChange={event => setTitle(event.target.value)} placeholder={t('titlePlaceholder')} maxLength={300} autoFocus autoComplete="off" />
                <MarkdownTextarea id="issue-description" label={t('descriptionLabel')} optional value={description} onChange={setDescription} dialogTitle={t('descriptionLabel')} placeholder={t('descriptionPlaceholder')} rows={4} maxLength={100_000} />
                <div className="grid grid-cols-2 gap-3">
                    <Field label={t('statusLabel')} htmlFor="new-issue-status">
                        <Select value={status} onValueChange={value => setStatus(value as IssueStatus)}>
                            <SelectTrigger id="new-issue-status" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                                {CREATE_STATUSES.map(option => (
                                    <SelectItem key={option} value={option}>
                                        <IssueStatusBadge status={option} />
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('priorityLabel')} htmlFor="new-issue-priority">
                        <IssuePriorityPicker id="new-issue-priority" priority={priority} onChange={setPriority} />
                    </Field>
                    <Field label={t('assigneeLabel')} optional htmlFor="new-issue-assignee">
                        <AssigneePicker id="new-issue-assignee" value={assignee} onChange={setAssignee} />
                    </Field>
                    <Field label={t('dueLabel')} optional htmlFor="new-issue-due">
                        <DateField id="new-issue-due" value={dueDate || null} onChange={day => setDueDate(day ?? '')} />
                    </Field>
                </div>
                {assignee?.kind === 'agent' && (status === 'backlog' || STARTS_AT_ONCE.has(status)) && <p className="-mt-1 text-xs text-muted-foreground">{status === 'backlog' ? t('coworkerBacklogHint') : t('coworkerHint')}</p>}
                <IssueRunsNotice coworkerAssigned={assignee?.kind === 'agent'} />
                {assignee?.kind === 'agent' && projectRestricted && <p className="-mt-3 text-xs text-muted-foreground/70">{tAssignee('restrictedNotice')}</p>}
                <DialogFooter className="flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={onClose} className="max-sm:flex-1">
                        {tCommon('cancel')}
                    </Button>
                    <Button type="submit" disabled={!title.trim()} loading={saving} className="max-sm:flex-1">
                        {t('submit')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    )
}
