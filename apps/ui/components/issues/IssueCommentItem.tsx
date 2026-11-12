'use client'

import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { WorkMemberAvatar } from '@/components/issues/WorkMemberAvatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { IssueComment } from '@lumvika/contracts'
import { fullDateTime, shortRelativeTime } from '@lumvika/i18n/format'
import { Markdown } from '@lumvika/ui/markdown'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

export function IssueCommentItem({ comment, mine, onEdit }: { comment: IssueComment; mine: boolean; onEdit: (body: string) => Promise<boolean> }) {
    const t = useTranslations('issues.comments')
    const tCommon = useTranslations('common')
    const locale = useLocale()
    const { labelOf } = useWorkMembers()
    const [draft, setDraft] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const save = async () => {
        if (draft === null || !draft.trim()) return
        setSaving(true)
        const saved = await onEdit(draft.trim())
        setSaving(false)
        if (saved) setDraft(null)
    }

    return (
        <li className="flex gap-2.5">
            <WorkMemberAvatar member={comment.author} size="sm" className="mt-0.5 self-start" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">{labelOf(comment.author)?.name}</span>
                    <time dateTime={comment.createdAt} title={fullDateTime(comment.createdAt, locale)} className="text-xs text-muted-foreground">
                        {shortRelativeTime(comment.createdAt, locale)}
                    </time>
                    {comment.editedAt && <span className="text-xs text-muted-foreground">{t('edited')}</span>}
                    {mine && draft === null && (
                        <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(comment.body)} className="ml-auto h-6 text-muted-foreground">
                            {t('edit')}
                        </Button>
                    )}
                </div>
                {draft === null ? (
                    <Markdown content={comment.body} className="text-sm break-words" />
                ) : (
                    <div className="flex flex-col gap-2">
                        <Textarea value={draft} onChange={event => setDraft(event.target.value)} aria-label={t('editLabel')} rows={3} maxLength={50_000} autoFocus />
                        <div className="flex flex-wrap justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                                {tCommon('cancel')}
                            </Button>
                            <Button type="button" size="sm" onClick={() => void save()} disabled={!draft.trim()} loading={saving}>
                                {tCommon('save')}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </li>
    )
}
