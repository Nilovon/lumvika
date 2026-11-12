'use client'

import { listProjectIssuesAction } from '@/app/api/_actions/issues.actions'
import { AssigneePicker } from '@/components/issues/AssigneePicker'
import { IssuePriorityPicker } from '@/components/issues/IssuePriorityPicker'
import { IssueStatusPicker } from '@/components/issues/IssueStatusPicker'
import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Field } from '@/components/ui/field'
import { DateField } from '@/components/ui/date-field'
import type { IssueDetail, IssuePriority, IssueStatus, IssueSummary, UpdateIssueInput, WorkMemberRef } from '@lumvika/contracts'
import { fullDateTime } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

const NO_PARENT = '__none'

type IssuePropertiesProps = {
    issue: IssueDetail
    disabled?: boolean
    onStatusChange: (status: IssueStatus) => void
    onPriorityChange: (priority: IssuePriority) => void
    onAssign: (assignee: WorkMemberRef | null) => void
    onUpdate: (input: UpdateIssueInput) => void
}

export function IssueProperties({ issue, disabled, onStatusChange, onPriorityChange, onAssign, onUpdate }: IssuePropertiesProps) {
    const t = useTranslations('issues.detail')
    const tAssignee = useTranslations('issues.assignee')
    const locale = useLocale()
    const { labelOf } = useWorkMembers()
    const [projectIssues, setProjectIssues] = useState<IssueSummary[] | null>(null)

    useEffect(() => {
        if (disabled) return
        let active = true
        void listProjectIssuesAction(issue.projectId).then(result => {
            if (active && result.ok) setProjectIssues(result.issues)
        })
        return () => {
            active = false
        }
    }, [issue.projectId, disabled])

    // A parent is any other issue of the project that is not already under this one.
    const parentOptions = useMemo<ComboboxOption[]>(() => {
        const children = new Set(issue.subIssues.map(child => child.id))
        const candidates = (projectIssues ?? []).filter(other => other.id !== issue.id && !children.has(other.id) && other.parentIssueId !== issue.id)
        return [{ value: NO_PARENT, label: t('noParent') }, ...candidates.map(other => ({ value: other.id, label: `${other.ref} ${other.title}`, keywords: [other.ref, other.title] }))]
    }, [projectIssues, issue.id, issue.subIssues, t])
    const parentLabel = projectIssues?.find(other => other.id === issue.parentIssueId)

    return (
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-1">
            <Field label={t('status')} htmlFor="issue-status">
                <IssueStatusPicker id="issue-status" variant="field" status={issue.status} onChange={onStatusChange} disabled={disabled} />
            </Field>
            <Field label={t('priority')} htmlFor="issue-priority">
                <IssuePriorityPicker id="issue-priority" priority={issue.priority} onChange={onPriorityChange} disabled={disabled} />
            </Field>
            <Field label={t('assignee')} htmlFor="issue-assignee" className="col-span-2 md:col-span-1" helperText={issue.projectRestricted && issue.assignee?.kind === 'agent' ? tAssignee('restrictedNotice') : undefined}>
                <AssigneePicker id="issue-assignee" value={issue.assignee} onChange={onAssign} disabled={disabled} />
            </Field>
            <Field label={t('dueDate')} htmlFor="issue-due">
                <DateField id="issue-due" value={issue.dueDate} onChange={dueDate => onUpdate({ dueDate })} disabled={disabled} />
            </Field>
            <Field label={t('parent')}>
                <Combobox
                    groups={[{ id: 'issues', options: parentOptions }]}
                    value={issue.parentIssueId ?? NO_PARENT}
                    onChange={value => onUpdate({ parentIssueId: value === NO_PARENT ? null : value })}
                    placeholder={parentLabel ? parentLabel.ref : t('noParent')}
                    searchPlaceholder={t('parentSearch')}
                    disabled={disabled || projectIssues === null}
                    className="h-8 min-h-8 px-2.5"
                />
            </Field>
            <p className="col-span-2 text-xs text-muted-foreground md:col-span-1">{t('created', { name: labelOf(issue.createdBy)?.name ?? '', date: fullDateTime(issue.createdAt, locale) })}</p>
        </div>
    )
}
