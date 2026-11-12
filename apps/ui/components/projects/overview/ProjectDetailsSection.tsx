'use client'

import { updateProjectAction } from '@/app/api/_actions/projects.actions'
import { AssigneePicker } from '@/components/issues/AssigneePicker'
import { OverviewSection } from '@/components/projects/overview/OverviewSection'
import { useProjectLinkOptions, type LinkOption } from '@/components/projects/overview/useProjectLinkOptions'
import { Field } from '@/components/ui/field'
import { DateField } from '@/components/ui/date-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useErrorText } from '@/hooks/useErrorText'
import type { ProjectDetail, ProjectStatus, UpdateProjectInput } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

// Archived is reached through Archive, which also takes the project off the list.
const EDITABLE_STATUSES = ['planned', 'active', 'paused', 'completed'] as const satisfies readonly ProjectStatus[]
const NONE = 'none'

// A team or a goal the project links to, or none. The current link shows by name even before the
// options load, and stays chosen if it is no longer among them.
function LinkSelect({ id, value, options, emptyLabel, disabled, onChange }: { id: string; value: string | null; options: LinkOption[] | null; emptyLabel: string; disabled: boolean; onChange: (value: string | null) => void }) {
    const current = options?.find(option => option.id === value)
    return (
        <Select value={value ?? NONE} onValueChange={next => onChange(next === NONE ? null : next)} disabled={disabled || options === null}>
            <SelectTrigger id={id} className="w-full">
                <SelectValue>{value ? (current?.label ?? '…') : emptyLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
                <SelectItem value={NONE}>{emptyLabel}</SelectItem>
                {options?.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                        <span className="truncate" style={{ paddingLeft: `${option.depth * 0.75}rem` }}>
                            {option.label}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

export function ProjectDetailsSection({ project, disabled, onSaved }: { project: ProjectDetail; disabled: boolean; onSaved: () => void }) {
    const t = useTranslations('projects.overview')
    const tStatus = useTranslations('projects.status')
    const errorText = useErrorText()
    const [saving, setSaving] = useState(false)
    const archived = project.status === 'archived'
    const links = useProjectLinkOptions()
    const linkOptions = links === 'failed' ? [] : links
    const linkHint = (hint: string) => (links === 'failed' ? t('optionsUnavailable') : hint)

    const save = async (input: UpdateProjectInput) => {
        setSaving(true)
        const result = await updateProjectAction(project.id, input)
        setSaving(false)
        if (!result.ok) toast.error(errorText(result))
        onSaved()
    }

    return (
        <OverviewSection title={t('detailsTitle')}>
            <Field label={t('statusLabel')} htmlFor="project-status" helperText={archived ? t('archivedStatusHint') : undefined}>
                <Select value={project.status} onValueChange={value => void save({ status: value as ProjectStatus })} disabled={disabled || saving || archived}>
                    <SelectTrigger id="project-status" className="w-full">
                        <SelectValue>{tStatus(project.status)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent position="popper">
                        {EDITABLE_STATUSES.map(status => (
                            <SelectItem key={status} value={status}>
                                {tStatus(status)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            <Field label={t('leadLabel')} htmlFor="project-lead" helperText={t('leadHint')}>
                <AssigneePicker id="project-lead" value={project.lead} onChange={lead => void save({ lead })} emptyLabel={t('noLead')} disabled={disabled || saving} />
            </Field>
            <Field label={t('teamLabel')} htmlFor="project-team" helperText={linkHint(t('teamHint'))}>
                <LinkSelect id="project-team" value={project.teamId} options={linkOptions?.teams ?? null} emptyLabel={t('noTeam')} disabled={disabled || saving} onChange={teamId => void save({ teamId })} />
            </Field>
            <Field label={t('goalLabel')} htmlFor="project-goal" helperText={linkHint(t('goalHint'))}>
                <LinkSelect id="project-goal" value={project.goalId} options={linkOptions?.goals ?? null} emptyLabel={t('noGoal')} disabled={disabled || saving} onChange={goalId => void save({ goalId })} />
            </Field>
            <Field label={t('targetLabel')} optional htmlFor="project-target-edit">
                <DateField id="project-target-edit" value={project.targetDate} onChange={targetDate => void save({ targetDate })} disabled={disabled || saving} />
            </Field>
        </OverviewSection>
    )
}
