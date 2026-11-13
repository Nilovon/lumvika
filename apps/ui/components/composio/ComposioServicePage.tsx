'use client'

import { clearComposioAuthConfigAction, createComposioAuthConfigAction, setComposioAuthConfigAction } from '@/app/api/_actions/composio.actions'
import type { ComposioService } from '@/app/api/_services/composio-settings.service'
import { ComposioPageHeader } from '@/components/composio/ComposioPageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { PanelScroller } from '@/components/ui/panel-list'
import { PanelRow } from '@/components/ui/panel-row'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TooltipDisabledReason } from '@/components/ui/tooltip'
import { useErrorText } from '@/hooks/useErrorText'
import type { ComposioAuthConfig } from '@/lib/composio/client'
import { Loader2Icon } from '@/lib/icons'
import { serviceIconProps } from '@/lib/services/icons'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'

type Busy = 'use' | 'create' | 'save' | 'clear' | null

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
            {children}
        </section>
    )
}

export function ComposioServicePage({ service, authConfigs, onBack, onChanged }: { service: ComposioService; authConfigs: ComposioAuthConfig[]; onBack: () => void; onChanged: () => void }) {
    const t = useTranslations('dialogs.composio')
    const errorText = useErrorText()
    const configs = authConfigs.filter(config => config.toolkit === service.toolkit && config.enabled)
    const [picked, setPicked] = useState(configs.find(config => config.id === service.authConfigId)?.id ?? '')
    const [manualId, setManualId] = useState('')
    const [busy, setBusy] = useState<Busy>(null)

    const run = async (kind: Exclude<Busy, null>, action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) => {
        setBusy(kind)
        const result = await action()
        setBusy(null)
        if (!result.ok) return toast.error(errorText(result))
        toast.success(success)
        onChanged()
    }

    const ready = t('service.saved', { name: service.name })
    const use = () => run('use', () => setComposioAuthConfigAction({ toolkit: service.toolkit, authConfigId: picked }), ready)
    const create = () => run('create', () => createComposioAuthConfigAction({ toolkit: service.toolkit }), ready)
    const clear = () => run('clear', () => clearComposioAuthConfigAction({ toolkit: service.toolkit }), t('service.cleared'))
    const save = (event: FormEvent) => {
        event.preventDefault()
        void run('save', () => setComposioAuthConfigAction({ toolkit: service.toolkit, authConfigId: manualId }), ready).then(() => setManualId(''))
    }

    const sourceLabel = service.authConfigSource === 'app' ? t('service.fromApp') : service.authConfigSource === 'catalog' ? t('service.fromCatalog') : null

    return (
        <>
            <ComposioPageHeader leading={<Icon {...serviceIconProps(service.icon, service.category)} size="sm" />} title={service.name} hint={t('service.hint', { toolkit: service.toolkit })} onBack={onBack} />
            <PanelScroller className="space-y-6 p-4">
                {!service.enabled && (
                    <Alert variant="warning">
                        <AlertDescription>{t('service.off')}</AlertDescription>
                    </Alert>
                )}

                <Section title={t('service.current')}>
                    <PanelRow
                        title={service.authConfigId ?? t('services.notSetUp')}
                        description={sourceLabel ?? t('service.none')}
                        meta={
                            <Badge size="xs" tone={service.authConfigId ? 'green' : 'orange'} glow={false}>
                                {service.authConfigId ? t('services.ready') : t('services.notSetUp')}
                            </Badge>
                        }
                        actions={
                            service.authConfigId && (
                                <TooltipDisabledReason reason={service.authConfigSource === 'app' ? undefined : t('service.clearDisabled')}>
                                    <Button size="xs" variant="outline" disabled={busy !== null || service.authConfigSource !== 'app'} onClick={clear}>
                                        {busy === 'clear' && <Loader2Icon className="animate-spin" />}
                                        {t('service.clear')}
                                    </Button>
                                </TooltipDisabledReason>
                            )
                        }
                    />
                </Section>

                {configs.length > 0 ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                            <Field label={t('service.pickLabel')} htmlFor="composio-auth-config">
                                <Select value={picked} onValueChange={setPicked}>
                                    <SelectTrigger id="composio-auth-config" className="w-full min-w-0">
                                        <SelectValue placeholder={t('service.pickPlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {configs.map(config => (
                                            <SelectItem key={config.id} value={config.id}>
                                                {config.composioManaged ? t('service.optionManaged', { name: config.name }) : t('service.optionCustom', { name: config.name })}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                        <Button className="self-end sm:shrink-0" disabled={busy !== null || !picked || picked === service.authConfigId} onClick={use}>
                            {busy === 'use' && <Loader2Icon className="animate-spin" />}
                            {t('service.use')}
                        </Button>
                    </div>
                ) : (
                    <Section title={t('service.pickLabel')}>
                        <p className="text-xs text-muted-foreground">{t('service.noneInProject', { toolkit: service.toolkit })}</p>
                    </Section>
                )}

                <Section title={t('service.createTitle')}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{t('service.createHint')}</p>
                        <Button variant="outline" className="self-end sm:self-auto sm:shrink-0" disabled={busy !== null} onClick={create}>
                            {busy === 'create' && <Loader2Icon className="animate-spin" />}
                            {t('service.create')}
                        </Button>
                    </div>
                </Section>

                <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                        <Input id="composio-auth-config-id" label={t('service.manualLabel')} placeholder={t('service.manualPlaceholder')} autoComplete="off" spellCheck={false} value={manualId} onChange={event => setManualId(event.target.value)} />
                    </div>
                    <Button type="submit" variant="outline" className="self-end sm:shrink-0" disabled={busy !== null || !manualId.trim()}>
                        {busy === 'save' && <Loader2Icon className="animate-spin" />}
                        {t('service.save')}
                    </Button>
                </form>
            </PanelScroller>
        </>
    )
}
