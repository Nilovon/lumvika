'use client'

import { DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useState, type KeyboardEvent } from 'react'

const MAX_TITLE = 300

// The title reads as a heading and turns into a field on a click; Enter or leaving it saves.
export function IssueTitleEditor({ title, disabled, onSave }: { title: string; disabled?: boolean; onSave: (title: string) => Promise<boolean> }) {
    const t = useTranslations('issues.detail')
    const [draft, setDraft] = useState<string | null>(null)

    const commit = async () => {
        if (draft === null) return
        const next = draft.trim()
        setDraft(null)
        if (next && next !== title) await onSave(next)
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            void commit()
        } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setDraft(null)
        }
    }

    if (draft !== null) {
        return (
            <>
                <DialogTitle className="sr-only">{title}</DialogTitle>
                <textarea
                    value={draft}
                    onChange={event => setDraft(event.target.value.replace(/\n/g, ' '))}
                    onBlur={() => void commit()}
                    onKeyDown={onKeyDown}
                    aria-label={t('titleLabel')}
                    maxLength={MAX_TITLE}
                    rows={2}
                    autoFocus
                    className="field-sizing-content w-full resize-none rounded-md bg-muted/50 px-1.5 py-0.5 font-heading text-lg leading-snug font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
            </>
        )
    }

    return (
        <DialogTitle asChild>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setDraft(title)}
                title={disabled ? undefined : t('editTitle')}
                className={cn('-mx-1.5 rounded-md px-1.5 py-0.5 text-left font-heading text-lg leading-snug font-medium break-words', !disabled && 'transition-colors hover:bg-muted/60')}
            >
                {title}
            </button>
        </DialogTitle>
    )
}
