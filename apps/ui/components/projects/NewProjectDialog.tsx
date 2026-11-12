'use client'

import { checkProjectKeyAction, createProjectAction, type ProjectKeyCheck } from '@/app/api/_actions/projects.actions'
import { AssigneePicker } from '@/components/issues/AssigneePicker'
import { isValidProjectKey, normalizeProjectKey, suggestProjectKey } from '@/components/projects/project-key'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useErrorText } from '@/hooks/useErrorText'
import type { ProjectVisibility, WorkMemberRef } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'

const KEY_CHECK_DELAY_MS = 300

type NewProjectDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    // Keys the caller already knows are taken, so the first suggestion avoids them.
    takenKeys: string[]
}

export function NewProjectDialog({ open, onOpenChange, takenKeys }: NewProjectDialogProps) {
    return <Dialog open={open} onOpenChange={onOpenChange}>{open && <NewProjectForm takenKeys={takenKeys} onDone={() => onOpenChange(false)} />}</Dialog>
}

function NewProjectForm({ takenKeys, onDone }: { takenKeys: string[]; onDone: () => void }) {
    const t = useTranslations('projects.create')
    const tCommon = useTranslations('common')
    const errorText = useErrorText()
    const router = useRouter()
    const [name, setName] = useState('')
    const [typedKey, setTypedKey] = useState<string | null>(null)
    const [description, setDescription] = useState('')
    const [visibility, setVisibility] = useState<ProjectVisibility>('workspace')
    const [lead, setLead] = useState<WorkMemberRef | null>(null)
    const [targetDate, setTargetDate] = useState('')
    const [check, setCheck] = useState<{ key: string; result: ProjectKeyCheck } | null>(null)
    const [submitting, setSubmitting] = useState(false)

    // The key follows the name until it is typed by hand.
    const key = typedKey ?? suggestProjectKey(name, takenKeys)
    const keyValid = isValidProjectKey(key)

    useEffect(() => {
        if (!keyValid) return
        let active = true
        const timer = setTimeout(() => {
            void checkProjectKeyAction(key).then(result => {
                if (active && result.ok) setCheck({ key, result: result.check })
            })
        }, KEY_CHECK_DELAY_MS)
        return () => {
            active = false
            clearTimeout(timer)
        }
    }, [key, keyValid])

    const keyTaken = check?.key === key && check.result === 'taken'
    const keyError = key && !keyValid ? t('keyInvalid') : keyTaken ? t('keyTaken', { key }) : undefined
    const canSubmit = name.trim().length > 0 && keyValid && !keyTaken && !submitting

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (!canSubmit) return
        setSubmitting(true)
        const result = await createProjectAction({ name: name.trim(), key, description: description.trim() || null, visibility, lead, targetDate: targetDate || null })
        setSubmitting(false)
        if (!result.ok) {
            if (result.code === 'projectKeyTaken') setCheck({ key, result: 'taken' })
            toast.error(errorText(result))
            return
        }
        toast.success(t('created', { name: name.trim() }))
        onDone()
        router.push(`/projects/${result.key}`)
    }

    return (
        <DialogContent className="sm:max-w-lg">
            <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                    <Input id="project-name" label={t('nameLabel')} value={name} onChange={event => setName(event.target.value)} placeholder={t('namePlaceholder')} maxLength={120} autoFocus autoComplete="off" />
                    <Field label={t('keyLabel')} htmlFor="project-key" error={keyError}>
                        <Input
                            id="project-key"
                            value={key}
                            onChange={event => setTypedKey(normalizeProjectKey(event.target.value))}
                            placeholder="ENG"
                            aria-invalid={!!keyError}
                            autoComplete="off"
                            spellCheck={false}
                            className="font-mono uppercase"
                        />
                    </Field>
                </div>
                <p className="-mt-2 text-xs text-muted-foreground">{t('keyHint', { example: `${keyValid ? key : 'ENG'}-1` })}</p>

                <Field label={t('descriptionLabel')} optional htmlFor="project-description">
                    <Textarea id="project-description" value={description} onChange={event => setDescription(event.target.value)} placeholder={t('descriptionPlaceholder')} rows={3} maxLength={20_000} />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('leadLabel')} optional>
                        <AssigneePicker value={lead} onChange={setLead} emptyLabel={t('noLead')} />
                    </Field>
                    <Input id="project-target" type="date" label={t('targetLabel')} optional value={targetDate} onChange={event => setTargetDate(event.target.value)} className="h-8" />
                </div>

                <Field label={t('visibilityLabel')} htmlFor="project-visibility" helperText={visibility === 'restricted' ? t('visibilityRestrictedHint') : t('visibilityWorkspaceHint')}>
                    <Select value={visibility} onValueChange={value => setVisibility(value as ProjectVisibility)}>
                        <SelectTrigger id="project-visibility" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                            <SelectItem value="workspace">{t('visibility.workspace')}</SelectItem>
                            <SelectItem value="restricted">{t('visibility.restricted')}</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>

                <DialogFooter className="flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={onDone} className="max-sm:flex-1">
                        {tCommon('cancel')}
                    </Button>
                    <Button type="submit" disabled={!canSubmit} loading={submitting} className="max-sm:flex-1">
                        {t('submit')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    )
}
