'use client'

import { Button } from '@/components/ui/button'
import { MarkdownTextarea } from '@/components/ui/markdown-textarea'
import { PencilIcon } from '@/lib/icons'
import { Markdown } from '@lumvika/ui/markdown'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

// The description as rendered markdown, edited in a plain field that also opens the long-form editor.
export function IssueDescriptionEditor({ description, disabled, onSave }: { description: string | null; disabled?: boolean; onSave: (description: string | null) => Promise<boolean> }) {
    const t = useTranslations('issues.detail')
    const tCommon = useTranslations('common')
    const [draft, setDraft] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const save = async () => {
        if (draft === null) return
        setSaving(true)
        const saved = await onSave(draft.trim() || null)
        setSaving(false)
        if (saved) setDraft(null)
    }

    if (draft !== null) {
        return (
            <div className="flex flex-col gap-2">
                <MarkdownTextarea value={draft} onChange={setDraft} label={t('descriptionLabel')} dialogTitle={t('descriptionLabel')} placeholder={t('descriptionPlaceholder')} rows={6} maxLength={100_000} autoFocus />
                <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                        {tCommon('cancel')}
                    </Button>
                    <Button type="button" size="sm" onClick={() => void save()} loading={saving}>
                        {tCommon('save')}
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <section className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{t('descriptionLabel')}</h3>
                {!disabled && description && (
                    <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(description)} className="text-muted-foreground">
                        <PencilIcon />
                        {t('edit')}
                    </Button>
                )}
            </div>
            {description ? (
                <Markdown content={description} className="text-sm" />
            ) : (
                <button type="button" disabled={disabled} onClick={() => setDraft('')} className="rounded-md border border-dashed border-border px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 disabled:cursor-default">
                    {disabled ? t('noDescription') : t('addDescription')}
                </button>
            )}
        </section>
    )
}
