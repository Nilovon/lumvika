'use client'

import { createTeamAction, updateTeamAction } from '@/app/api/_actions/teams.actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useErrorText } from '@/hooks/useErrorText'
import { CheckIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { Team } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

export const TEAM_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2'] as const

type TeamDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    // Absent to create a team.
    team?: Team
    onSaved: (team: Team) => void
}

export function TeamDialog({ open, onOpenChange, team, onSaved }: TeamDialogProps) {
    return <Dialog open={open} onOpenChange={onOpenChange}>{open && <TeamForm team={team} onClose={() => onOpenChange(false)} onSaved={onSaved} />}</Dialog>
}

function TeamForm({ team, onClose, onSaved }: { team?: Team; onClose: () => void; onSaved: (team: Team) => void }) {
    const t = useTranslations('teams.dialog')
    const errorText = useErrorText()
    const [name, setName] = useState(team?.name ?? '')
    const [description, setDescription] = useState(team?.description ?? '')
    const [color, setColor] = useState<string | null>(team ? team.color : TEAM_COLORS[0])
    const [saving, setSaving] = useState(false)

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        setSaving(true)
        const input = { name, description: description.trim() || null, color }
        const result = team ? await updateTeamAction(team.id, input) : await createTeamAction(input)
        setSaving(false)
        if (!result.ok) {
            toast.error(errorText(result))
            return
        }
        toast.success(team ? t('saved') : t('created'))
        onSaved(result.team)
        onClose()
    }

    return (
        <DialogContent className="sm:max-w-md">
            <form onSubmit={submit} className="flex flex-col gap-4">
                <DialogHeader>
                    <DialogTitle>{team ? t('editTitle') : t('createTitle')}</DialogTitle>
                    <DialogDescription>{team ? t('editDescription') : t('createDescription')}</DialogDescription>
                </DialogHeader>
                <Input id="team-name" label={t('name')} placeholder={t('namePlaceholder')} value={name} onChange={event => setName(event.target.value)} maxLength={80} autoFocus required />
                <Textarea id="team-description" label={t('descriptionLabel')} optional placeholder={t('descriptionPlaceholder')} value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} className="min-h-20" />
                <Field label={t('color')}>
                    <div role="radiogroup" aria-label={t('color')} className="flex flex-wrap gap-2">
                        {TEAM_COLORS.map((swatch, index) => (
                            <button
                                key={swatch}
                                type="button"
                                role="radio"
                                aria-checked={color === swatch}
                                aria-label={t('colorOption', { index: index + 1 })}
                                onClick={() => setColor(swatch)}
                                className={cn('flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', color === swatch && 'ring-2 ring-foreground')}
                                style={{ backgroundColor: swatch }}
                            >
                                {color === swatch && <CheckIcon className="size-4 text-white" />}
                            </button>
                        ))}
                        <button
                            type="button"
                            role="radio"
                            aria-checked={color === null}
                            aria-label={t('noColor')}
                            onClick={() => setColor(null)}
                            className={cn('flex size-8 items-center justify-center rounded-full border border-dashed border-muted-foreground/60 ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', color === null && 'ring-2 ring-foreground')}
                        >
                            {color === null && <CheckIcon className="size-4 text-muted-foreground" />}
                        </button>
                    </div>
                </Field>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <Button type="submit" loading={saving} disabled={!name.trim()}>
                        {team ? t('save') : t('create')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    )
}
