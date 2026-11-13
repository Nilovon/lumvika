'use client'

import { updateProjectAction } from '@/app/api/_actions/projects.actions'
import { OverviewSection } from '@/components/projects/overview/OverviewSection'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MarkdownTextarea } from '@/components/ui/markdown-textarea'
import { Textarea } from '@/components/ui/textarea'
import { useErrorText } from '@/hooks/useErrorText'
import type { ProjectDetail } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

export function ProjectAboutForm({ project, disabled, onSaved }: { project: ProjectDetail; disabled: boolean; onSaved: () => void }) {
    const t = useTranslations('projects.overview')
    const errorText = useErrorText()
    const [name, setName] = useState(project.name)
    const [description, setDescription] = useState(project.description ?? '')
    const [instructions, setInstructions] = useState(project.instructions ?? '')
    const [saving, setSaving] = useState(false)
    const dirty = name.trim() !== project.name || description.trim() !== (project.description ?? '') || instructions.trim() !== (project.instructions ?? '')

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (!dirty || !name.trim() || saving) return
        setSaving(true)
        const result = await updateProjectAction(project.id, { name: name.trim(), description: description.trim() || null, instructions: instructions.trim() || null })
        setSaving(false)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        toast.success(t('saved'))
        onSaved()
    }

    return (
        <form onSubmit={submit} className="flex flex-col gap-6">
            <OverviewSection title={t('aboutTitle')}>
                <Input id="project-name-edit" label={t('nameLabel')} value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={disabled} />
                <Field label={t('descriptionLabel')} optional htmlFor="project-description-edit">
                    <Textarea id="project-description-edit" value={description} onChange={event => setDescription(event.target.value)} placeholder={t('descriptionPlaceholder')} rows={3} maxLength={20_000} disabled={disabled} />
                </Field>
            </OverviewSection>

            <OverviewSection title={t('instructionsTitle')} description={t('instructionsExplainer')}>
                <MarkdownTextarea
                    id="project-instructions"
                    label={t('instructionsLabel')}
                    optional
                    value={instructions}
                    onChange={setInstructions}
                    dialogTitle={t('instructionsTitle')}
                    dialogDescription={t('instructionsExplainer')}
                    placeholder={t('instructionsPlaceholder')}
                    helperText={t('instructionsHint')}
                    rows={8}
                    maxLength={50_000}
                    disabled={disabled}
                />
            </OverviewSection>

            {!disabled && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {dirty && <span className="text-xs text-muted-foreground">{t('unsaved')}</span>}
                    <Button type="submit" size="sm" disabled={!dirty || !name.trim()} loading={saving} className="max-sm:w-full">
                        {t('save')}
                    </Button>
                </div>
            )}
        </form>
    )
}
