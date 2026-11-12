'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'

const MAX_COMMENT = 50_000

export type ReviewCommentMode = 'requestChanges' | 'unblock'

type ReviewCommentDialogProps = {
    mode: ReviewCommentMode
    issueRef: string | null
    onOpenChange: (open: boolean) => void
    // Resolves to whether it worked: the dialog stays open on a refusal so the comment is not lost.
    onConfirm: (comment: string) => Promise<boolean>
}

// The comment a verdict carries: required to send an issue back with changes, optional to unblock one.
export function ReviewCommentDialog({ mode, issueRef, onOpenChange, onConfirm }: ReviewCommentDialogProps) {
    return <Dialog open={!!issueRef} onOpenChange={onOpenChange}>{issueRef && <ReviewCommentForm key={`${mode}-${issueRef}`} mode={mode} issueRef={issueRef} onClose={() => onOpenChange(false)} onConfirm={onConfirm} />}</Dialog>
}

function ReviewCommentForm({ mode, issueRef, onClose, onConfirm }: { mode: ReviewCommentMode; issueRef: string; onClose: () => void; onConfirm: (comment: string) => Promise<boolean> }) {
    const t = useTranslations(`review.${mode}`)
    const tCommon = useTranslations('common')
    const [comment, setComment] = useState('')
    const [saving, setSaving] = useState(false)
    const required = mode === 'requestChanges'
    const missing = required && !comment.trim()

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (missing || saving) return
        setSaving(true)
        const done = await onConfirm(comment.trim())
        setSaving(false)
        if (done) onClose()
    }

    return (
        <DialogContent className="sm:max-w-md">
            <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
                <DialogHeader>
                    <DialogTitle>{t('title', { ref: issueRef })}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>
                <Textarea id={`review-${mode}-comment`} label={t('label')} optional={!required} value={comment} onChange={event => setComment(event.target.value)} placeholder={t('placeholder')} rows={4} maxLength={MAX_COMMENT} className="max-h-60" autoFocus />
                <DialogFooter className="flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={onClose} className="max-sm:flex-1">
                        {tCommon('cancel')}
                    </Button>
                    <Button type="submit" disabled={missing} loading={saving} className="max-sm:flex-1">
                        {t('confirm')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    )
}
