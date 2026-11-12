'use client'

import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type AssistantRenameDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    onRename: (title: string) => Promise<unknown>
}

export function AssistantRenameDialog({ open, onOpenChange, title, onRename }: AssistantRenameDialogProps) {
    const t = useTranslations('assistant.rename')
    const [value, setValue] = useState(title)
    const [saving, setSaving] = useState(false)
    const trimmed = value.trim()

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (!trimmed || trimmed === title) return onOpenChange(false)
        setSaving(true)
        await onRename(trimmed)
        setSaving(false)
        onOpenChange(false)
    }

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                if (next) setValue(title)
                onOpenChange(next)
            }}
        >
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{t('title')}</DialogTitle>
                    </DialogHeader>
                    <Input id="assistant-chat-title" label={t('label')} value={value} onChange={event => setValue(event.target.value)} maxLength={200} autoFocus autoComplete="off" />
                    <DialogFooter className="flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="max-sm:flex-1">
                            {t('cancel')}
                        </Button>
                        <Button type="submit" disabled={!trimmed} loading={saving} className="max-sm:flex-1">
                            {t('save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
