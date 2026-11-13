'use client'

import { disconnectComposioAction, getComposioOverviewAction } from '@/app/api/_actions/composio.actions'
import type { ComposioOverview, ComposioService } from '@/app/api/_services/composio-settings.service'
import { ComposioKeyPage } from '@/components/composio/ComposioKeyPage'
import { ComposioServicePage } from '@/components/composio/ComposioServicePage'
import { Group } from '@/components/connections/AiProvidersPanel'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { PanelDialogContent } from '@/components/dialogs/PanelDialogContent'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Icon } from '@/components/ui/icon'
import { PanelScroller } from '@/components/ui/panel-list'
import { PanelRow } from '@/components/ui/panel-row'
import { PanelSteps } from '@/components/ui/panel-steps'
import { SkeletonList } from '@/components/ui/skeleton'
import { TooltipDisabledReason } from '@/components/ui/tooltip'
import { useErrorText } from '@/hooks/useErrorText'
import { BlocksIcon, ChevronRightIcon, KeyIcon } from '@/lib/icons'
import { serviceIconProps } from '@/lib/services/icons'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

type ComposioPage = { kind: 'list' } | { kind: 'key' } | { kind: 'service'; slug: string }

// The Composio connection of a self-hosted install: its API key and, per app of the catalog that
// signs in through Composio, the auth config it uses. Instance-wide, so only ADMIN_EMAILS see it.
export function ComposioDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const t = useTranslations('dialogs.composio')
    const errorText = useErrorText()
    const [overview, setOverview] = useState<ComposioOverview | null>(null)
    const [loadFailed, setLoadFailed] = useState(false)
    const [page, setPage] = useState<ComposioPage>({ kind: 'list' })
    const [confirmRemove, setConfirmRemove] = useState(false)
    const [removing, setRemoving] = useState(false)

    const refresh = useCallback(async () => {
        const result = await getComposioOverviewAction()
        setLoadFailed(!result.ok)
        if (!result.ok) return toast.error(errorText(result))
        setOverview(result.overview)
    }, [errorText])

    useEffect(() => {
        if (!open) return
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is set once the read answers, not in the effect body
        void refresh()
    }, [open, refresh])

    const back = () => setPage({ kind: 'list' })

    const removeKey = async () => {
        setRemoving(true)
        const result = await disconnectComposioAction()
        setRemoving(false)
        setConfirmRemove(false)
        if (!result.ok) return toast.error(errorText(result))
        toast.success(t('removeKey.removed'))
        void refresh()
    }

    const selected = page.kind === 'service' ? overview?.services.find(service => service.slug === page.slug) : undefined
    const stepKey = page.kind === 'service' ? `service:${page.slug}` : page.kind

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                onOpenChange(next)
                if (!next) setPage({ kind: 'list' })
            }}
        >
            <PanelDialogContent className="sm:h-[min(44rem,90dvh)] sm:max-w-xl">
                <DialogHeader className="border-b px-4 py-4">
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                <div className="flex min-h-0 flex-1 flex-col">
                    <PanelSteps stepKey={stepKey} depth={stepKey === 'list' ? 0 : 1}>
                        {page.kind === 'key' ? (
                            <ComposioKeyPage
                                onBack={back}
                                onSaved={() => {
                                    back()
                                    void refresh()
                                }}
                            />
                        ) : selected && overview ? (
                            <ComposioServicePage key={selected.slug} service={selected} authConfigs={overview.authConfigs} onBack={back} onChanged={() => void refresh()} />
                        ) : !overview && loadFailed ? (
                            <EmptyState
                                icon={BlocksIcon}
                                title={t('loadFailed')}
                                action={
                                    <Button variant="outline" onClick={() => void refresh()}>
                                        {t('retry')}
                                    </Button>
                                }
                            />
                        ) : !overview ? (
                            <div className="p-4">
                                <SkeletonList rows={4} />
                            </div>
                        ) : (
                            <PanelScroller className="space-y-6 p-4">
                                <Group title={t('groups.connection')}>
                                    <KeyRow overview={overview} onEdit={() => setPage({ kind: 'key' })} onRemove={() => setConfirmRemove(true)} />
                                    {overview.authConfigsError && (
                                        <Alert variant="warning">
                                            <AlertDescription>{errorText({ error: overview.authConfigsError, code: overview.authConfigsError })}</AlertDescription>
                                        </Alert>
                                    )}
                                </Group>

                                <Group title={t('groups.services')}>
                                    {overview.services.length === 0 ? (
                                        <EmptyState icon={BlocksIcon} title={t('services.empty')} />
                                    ) : (
                                        <>
                                            {!overview.keySource && <p className="text-xs text-muted-foreground">{t('services.needsKey')}</p>}
                                            {overview.services.map(service => (
                                                <ServiceRow key={service.slug} service={service} disabled={!overview.keySource} onOpen={() => setPage({ kind: 'service', slug: service.slug })} />
                                            ))}
                                        </>
                                    )}
                                </Group>
                            </PanelScroller>
                        )}
                    </PanelSteps>
                </div>
            </PanelDialogContent>

            <ConfirmDialog
                open={confirmRemove}
                onOpenChange={setConfirmRemove}
                title={t('removeKey.title')}
                description={t('removeKey.description')}
                confirmLabel={t('removeKey.confirm')}
                pending={removing}
                onConfirm={event => {
                    event.preventDefault()
                    void removeKey()
                }}
            />
        </Dialog>
    )
}

function KeyRow({ overview, onEdit, onRemove }: { overview: ComposioOverview; onEdit: () => void; onRemove: () => void }) {
    const t = useTranslations('dialogs.composio')
    const { keySource, keyHint, namespace } = overview
    const status =
        keySource === 'environment' ? t('key.fromEnvironment') : keySource === 'app' ? (keyHint ? t('key.fromApp', { hint: keyHint }) : t('key.fromAppNoHint')) : t('key.missing')
    const environmentReason = keySource === 'environment' ? t('key.environmentOnly') : undefined

    return (
        <PanelRow
            leading={<Icon icon={KeyIcon} size="sm" />}
            title={t('key.title')}
            meta={
                <Badge size="xs" tone={keySource ? 'green' : 'neutral'} glow={false}>
                    {keySource ? t('key.connected') : t('key.notConnected')}
                </Badge>
            }
            description={status}
            footer={keySource ? t('key.namespace', { namespace }) : undefined}
        >
            <div className="mt-2 flex flex-wrap gap-1.5">
                <TooltipDisabledReason reason={environmentReason}>
                    <Button size="xs" variant={keySource ? 'outline' : 'default'} disabled={!!environmentReason} onClick={onEdit}>
                        {keySource ? t('key.change') : t('key.connect')}
                    </Button>
                </TooltipDisabledReason>
                {keySource === 'app' && (
                    <Button size="xs" variant="ghost" onClick={onRemove}>
                        {t('key.remove')}
                    </Button>
                )}
            </div>
        </PanelRow>
    )
}

function ServiceRow({ service, disabled, onOpen }: { service: ComposioService; disabled: boolean; onOpen: () => void }) {
    const t = useTranslations('dialogs.composio')
    const description = service.authConfigId ? t('services.toolkitReady', { toolkit: service.toolkit, authConfigId: service.authConfigId }) : t('services.toolkitMissing', { toolkit: service.toolkit })

    return (
        <PanelRow
            onClick={onOpen}
            disabled={disabled}
            leading={<Icon {...serviceIconProps(service.icon, service.category)} size="sm" />}
            title={service.name}
            meta={
                <>
                    {!service.enabled && (
                        <Badge size="xs" tone="neutral" glow={false}>
                            {t('services.off')}
                        </Badge>
                    )}
                    <Badge size="xs" tone={service.authConfigId ? 'green' : 'orange'} glow={false}>
                        {service.authConfigId ? t('services.ready') : t('services.notSetUp')}
                    </Badge>
                </>
            }
            description={description}
            actions={<ChevronRightIcon className="size-4 text-muted-foreground" />}
        />
    )
}
