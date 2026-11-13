'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'

const MAX_REASON = 2000

// Moving an issue to Blocked says why: the people and coworkers who pick it up next read the reason.
export function BlockedReasonDialog({ issueRef, open, onOpenChange, onConfirm }: { issueRef: string; open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason: string) => Promise<unknown> | void }) {
    return <Dialog open={open} onOpenChange={onOpenChange}>{open && <BlockedReasonForm issueRef={issueRef} onClose={() => onOpenChange(false)} onConfirm={onConfirm} />}</Dialog>
}

function BlockedReasonForm({ issueRef, onClose, onConfirm }: { issueRef: string; onClose: () => void; onConfirm: (reason: string) => Promise<unknown> | void }) {
    const t = useTranslations('issues.blocked')
    const tCommon = useTranslations('common')
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (!reason.trim() || saving) return
        setSaving(true)
        await onConfirm(reason.trim())
        setSaving(false)
        onClose()
    }

    return (
        <DialogContent className="sm:max-w-md">
            <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
                <DialogHeader>
                    <DialogTitle>{t('title', { ref: issueRef })}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>
                <Textarea id="blocked-reason" label={t('reasonLabel')} value={reason} onChange={event => setReason(event.target.value)} placeholder={t('placeholder')} rows={3} maxLength={MAX_REASON} autoFocus />
                <DialogFooter className="flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={onClose} className="max-sm:flex-1">
                        {tCommon('cancel')}
                    </Button>
                    <Button type="submit" disabled={!reason.trim()} loading={saving} className="max-sm:flex-1">
                        {t('confirm')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    )
}
