'use client'

import { Button } from '@/components/ui/button'
import { PlusIcon } from '@/lib/icons'
import type { IssueStatus } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent, type KeyboardEvent } from 'react'

// A title typed at the end of a column becomes an issue of that column. The field stays open for the
// next one, so a list is typed in one go; Escape or an empty blur closes it.
export function QuickAddIssue({ status, onCreate }: { status: IssueStatus; onCreate: (title: string, status: IssueStatus) => Promise<unknown> }) {
    const t = useTranslations('projects.board')
    const tStatus = useTranslations('issues.status')
    const [open, setOpen] = useState(false)
    const [title, setTitle] = useState('')
    const [saving, setSaving] = useState(false)

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        const trimmed = title.trim()
        if (!trimmed || saving) return
        setSaving(true)
        await onCreate(trimmed, status)
        setSaving(false)
        setTitle('')
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Escape') {
            setTitle('')
            setOpen(false)
        } else if (event.key === 'Enter' && !event.shiftKey) {
            void submit(event)
        }
    }

    if (!open) {
        return (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="w-full justify-start text-muted-foreground" aria-label={t('quickAddIn', { status: tStatus(status) })}>
                <PlusIcon />
                {t('quickAdd')}
            </Button>
        )
    }

    return (
        <form onSubmit={submit} className="rounded-md border border-border bg-card p-1.5 shadow-xs">
            <textarea
                value={title}
                onChange={event => setTitle(event.target.value)}
                onKeyDown={onKeyDown}
                onBlur={() => !title.trim() && setOpen(false)}
                placeholder={t('quickAddPlaceholder')}
                aria-label={t('quickAddIn', { status: tStatus(status) })}
                maxLength={300}
                rows={2}
                autoFocus
                className="w-full resize-none bg-transparent px-1 py-0.5 text-[13px] outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-muted-foreground max-sm:hidden">{t('quickAddHint')}</span>
                <Button type="submit" size="xs" disabled={!title.trim()} loading={saving} className="ml-auto">
                    {t('quickAddSubmit')}
                </Button>
            </div>
        </form>
    )
}
