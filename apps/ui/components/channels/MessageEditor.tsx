'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type MessageEditorProps = {
    initialBody: string
    saving: boolean
    onSave: (body: string) => void
    onCancel: () => void
}

// Enter saves, Shift+Enter breaks the line, Escape gives up: the keys of the composer.
export function MessageEditor({ initialBody, saving, onSave, onCancel }: MessageEditorProps) {
    const t = useTranslations('channels.message')
    const [body, setBody] = useState(initialBody)
    const canSave = body.trim().length > 0 && body.trim() !== initialBody.trim()

    return (
        <div className="mt-1 space-y-2">
            <Textarea
                autoFocus
                aria-label={t('editLabel')}
                value={body}
                onChange={event => setBody(event.target.value)}
                onKeyDown={event => {
                    if (event.key === 'Escape') {
                        event.preventDefault()
                        onCancel()
                    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        if (canSave) onSave(body.trim())
                    }
                }}
                className="min-h-16 text-sm"
            />
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                    {t('cancel')}
                </Button>
                <Button type="button" size="sm" loading={saving} disabled={!canSave} onClick={() => onSave(body.trim())}>
                    {t('save')}
                </Button>
            </div>
        </div>
    )
}
