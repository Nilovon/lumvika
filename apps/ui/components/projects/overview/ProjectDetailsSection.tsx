'use client'

import { updateProjectAction } from '@/app/api/_actions/projects.actions'
import { AssigneePicker } from '@/components/issues/AssigneePicker'
import { OverviewSection } from '@/components/projects/overview/OverviewSection'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useErrorText } from '@/hooks/useErrorText'
import type { ProjectDetail, ProjectStatus, UpdateProjectInput } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

// Archived is reached through Archive, which also takes the project off the list.
const EDITABLE_STATUSES = ['planned', 'active', 'paused', 'completed'] as const satisfies readonly ProjectStatus[]

export function ProjectDetailsSection({ project, disabled, onSaved }: { project: ProjectDetail; disabled: boolean; onSaved: () => void }) {
    const t = useTranslations('projects.overview')
    const tStatus = useTranslations('projects.status')
    const errorText = useErrorText()
    const [saving, setSaving] = useState(false)
    const archived = project.status === 'archived'

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
            <Input id="project-target-edit" type="date" label={t('targetLabel')} optional value={project.targetDate ?? ''} onChange={event => void save({ targetDate: event.target.value || null })} disabled={disabled || saving} className="h-8" />
        </OverviewSection>
    )
}
