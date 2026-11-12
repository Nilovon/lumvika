'use client'

import { IssueCommentItem } from '@/components/issues/IssueCommentItem'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import type { IssueComment } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent, type KeyboardEvent } from 'react'

type IssueCommentsProps = {
    comments: IssueComment[] | null
    meId: string | null
    onAdd: (body: string) => Promise<boolean>
    onEdit: (commentId: string, body: string) => Promise<boolean>
}

export function IssueComments({ comments, meId, onAdd, onEdit }: IssueCommentsProps) {
    const t = useTranslations('issues.comments')
    const [draft, setDraft] = useState('')
    const [sending, setSending] = useState(false)

    const submit = async (event?: FormEvent) => {
        event?.preventDefault()
        const body = draft.trim()
        if (!body || sending) return
        setSending(true)
        const sent = await onAdd(body)
        setSending(false)
        if (sent) setDraft('')
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {comments === null ? (
                <CommentsSkeleton />
            ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('empty')}</p>
            ) : (
                <ol className="flex flex-col gap-4">
                    {comments.map(comment => (
                        <IssueCommentItem key={comment.id} comment={comment} mine={comment.author.kind === 'user' && comment.author.userId === meId} onEdit={body => onEdit(comment.id, body)} />
                    ))}
                </ol>
            )}
            <form onSubmit={submit} className="flex flex-col gap-2">
                <Textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder={t('placeholder')} aria-label={t('placeholder')} rows={3} maxLength={50_000} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">{t('hint')}</span>
                    <Button type="submit" size="sm" disabled={!draft.trim()} loading={sending} className="ml-auto max-sm:w-full">
                        {t('submit')}
                    </Button>
                </div>
            </form>
        </div>
    )
}

function CommentsSkeleton() {
    return (
        <div className="flex flex-col gap-4">
            {['w-3/4', 'w-1/2'].map(width => (
                <div key={width} className="flex gap-2.5">
                    <Skeleton className="size-5 shrink-0 rounded-full" />
                    <div className="flex flex-1 flex-col gap-1.5">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className={`h-3.5 ${width}`} />
                    </div>
                </div>
            ))}
        </div>
    )
}
