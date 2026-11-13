'use client'

import { connectComposioAction } from '@/app/api/_actions/composio.actions'
import { ComposioPageHeader } from '@/components/composio/ComposioPageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PanelScroller } from '@/components/ui/panel-list'
import { useErrorText } from '@/hooks/useErrorText'
import { Loader2Icon } from '@/lib/icons'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

const COMPOSIO_DASHBOARD_URL = 'https://platform.composio.dev'

export function ComposioKeyPage({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
    const t = useTranslations('dialogs.composio')
    const errorText = useErrorText()
    const [apiKey, setApiKey] = useState('')
    const [saving, setSaving] = useState(false)

    const save = async (event: FormEvent) => {
        event.preventDefault()
        setSaving(true)
        const result = await connectComposioAction({ apiKey })
        setSaving(false)
        if (!result.ok) return toast.error(errorText(result))
        toast.success(t('keyPage.saved'))
        onSaved()
    }

    return (
        <>
            <ComposioPageHeader title={t('keyPage.title')} hint={t('keyPage.hint')} onBack={onBack} />
            <PanelScroller className="p-4">
                <form onSubmit={save} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {t.rich('keyPage.help', {
                            link: chunks => (
                                <a href={COMPOSIO_DASHBOARD_URL} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
                                    {chunks}
                                </a>
                            ),
                        })}
                    </p>
                    <Input id="composio-api-key" label={t('keyPage.label')} placeholder={t('keyPage.placeholder')} type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} />
                    <div className="flex justify-end">
                        <Button type="submit" disabled={saving || !apiKey.trim()}>
                            {saving && <Loader2Icon className="animate-spin" />}
                            {t('keyPage.save')}
                        </Button>
                    </div>
                </form>
            </PanelScroller>
        </>
    )
}
