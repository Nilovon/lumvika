'use client'

import { IssueRow } from '@/components/issues/IssueRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon } from '@/lib/icons'
import type { IssueSummary } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'

export function IssueSubIssues({ subIssues, canAdd, onAdd, onOpen }: { subIssues: IssueSummary[]; canAdd: boolean; onAdd: (title: string) => Promise<boolean>; onOpen: (issue: IssueSummary) => void }) {
    const t = useTranslations('issues.detail')
    const [adding, setAdding] = useState(false)
    const [title, setTitle] = useState('')
    const [saving, setSaving] = useState(false)
    const done = subIssues.filter(child => child.status === 'done').length

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        const trimmed = title.trim()
        if (!trimmed || saving) return
        setSaving(true)
        const created = await onAdd(trimmed)
        setSaving(false)
        if (created) setTitle('')
    }

    return (
        <section className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{subIssues.length > 0 ? t('subIssuesCount', { done, total: subIssues.length }) : t('subIssues')}</h3>
                {canAdd && !adding && (
                    <Button type="button" size="xs" variant="ghost" onClick={() => setAdding(true)} className="text-muted-foreground">
                        <PlusIcon />
                        {t('addSubIssue')}
                    </Button>
                )}
            </div>
            {subIssues.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border">
                    {subIssues.map(child => (
                        <IssueRow key={child.id} issue={child} onOpen={onOpen} className="py-2" />
                    ))}
                </div>
            )}
            {adding && (
                <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
                    <Input
                        value={title}
                        onChange={event => setTitle(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Escape') {
                                event.stopPropagation()
                                setAdding(false)
                            }
                        }}
                        placeholder={t('subIssuePlaceholder')}
                        aria-label={t('subIssuePlaceholder')}
                        maxLength={300}
                        autoFocus
                        className="min-w-0 flex-1 basis-48"
                    />
                    <div className="flex gap-2 max-sm:w-full">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)} className="max-sm:flex-1">
                            {t('done')}
                        </Button>
                        <Button type="submit" size="sm" disabled={!title.trim()} loading={saving} className="max-sm:flex-1">
                            {t('addSubIssueSubmit')}
                        </Button>
                    </div>
                </form>
            )}
            {subIssues.length === 0 && !adding && <p className="text-xs text-muted-foreground">{t('noSubIssues')}</p>}
        </section>
    )
}
