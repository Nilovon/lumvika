'use client'

import { readPlanLimitsAction } from '@/app/api/_actions/workspace-connection.actions'
import { DetailBlock } from '@/components/connections/DetailBlock'
import { PlanLimitMeter } from '@/components/connections/SourceBits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipLabeled } from '@/components/ui/tooltip'
import { mergePlanLimits } from '@/hooks/useWorkspaceConnections'
import { useErrorText } from '@/hooks/useErrorText'
import { livePlanWindows, planWindowName } from '@/lib/engine/ai-sources'
import { elapsedShare, paceOf, remainingPercent, type LimitPace } from '@/lib/engine/plan-usage'
import type { BoxConnection } from '@/lib/engine/types'
import { AlertTriangle, RefreshCwIcon } from '@/lib/icons'
import { fullDateTime, shortRelativeTime, shortUntil } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { PlanExtraUsage, PlanLimitWindow, PlanLimits } from '@lumvika/contracts'
import { formatDate } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const MINUTE_MS = 60_000
// The engine reads a subscription again on its own past this age; opening the view asks sooner.
const STALE_AFTER_MS = 5 * MINUTE_MS

type Connection = Pick<BoxConnection, 'id' | 'planLimits' | 'provider'>

function isStale(planLimits: PlanLimits | null, now: number): boolean {
    return !planLimits || now - Date.parse(planLimits.capturedAt) > STALE_AFTER_MS
}

// Ticks once a minute, so "resets in" and the pace keep up with a view left open.
function useMinuteClock(): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), MINUTE_MS)
        return () => clearInterval(timer)
    }, [])
    return now
}

// Where a subscription stands against its own plan: what the provider meters, not what Lumvika
// bills. Every window with what is left of it, its pace and its reset; read again on demand.
export function PlanLimitsBlock({ connection }: { connection: Connection }) {
    const t = useTranslations('connections')
    const errorText = useErrorText()
    const locale = useLocale()
    const now = useMinuteClock()
    const [refreshing, setRefreshing] = useState(false)
    // False on an engine older than the usage view: it cannot read on demand.
    const [refreshable, setRefreshable] = useState(true)
    const { planLimits } = connection

    const refresh = useCallback(async () => {
        setRefreshing(true)
        const result = await readPlanLimitsAction(connection.id, true)
        setRefreshing(false)
        if (!result.success) {
            toast.error(errorText(result, t('usage.probeFailed')))
            return
        }
        if (!result.read) {
            setRefreshable(false)
            return
        }
        mergePlanLimits(connection.id, result.read.planLimits)
    }, [connection.id, errorText, t])

    const askedOnOpen = useRef<string | null>(null)
    useEffect(() => {
        if (askedOnOpen.current === connection.id || !isStale(planLimits, Date.now())) return
        askedOnOpen.current = connection.id
        void refresh()
    }, [connection.id, planLimits, refresh])

    const checked = planLimits ? (now - Date.parse(planLimits.capturedAt) < MINUTE_MS ? t('usage.checkedJustNow') : t('usage.checkedAgo', { age: shortRelativeTime(planLimits.capturedAt, locale) })) : null
    const aside = (
        <div className="flex min-w-0 items-center gap-1.5">
            {checked && <span className="truncate text-[11px] text-muted-foreground">{checked}</span>}
            {refreshable && (
                <TooltipLabeled label={t('usage.refresh')}>
                    <Button size="icon-sm" variant="ghost" aria-label={t('usage.refresh')} loading={refreshing} onClick={() => void refresh()}>
                        <RefreshCwIcon className="size-3.5" />
                    </Button>
                </TooltipLabeled>
            )}
        </div>
    )

    return (
        <DetailBlock title={t('planLimits.title')} aside={aside}>
            <PlanLimitsBody connection={connection} now={now} refreshing={refreshing} />
        </DetailBlock>
    )
}

function PlanLimitsBody({ connection, now, refreshing }: { connection: Connection; now: number; refreshing: boolean }) {
    const t = useTranslations('connections')
    const locale = useLocale()
    const { planLimits } = connection
    const windows = livePlanWindows(connection, now)

    if (!planLimits && refreshing) return <PlanLimitsSkeleton />
    if (!planLimits) return <Note>{t('usage.empty')}</Note>
    if (planLimits.unavailable?.reason === 'unsupported') return <Note>{connection.provider === 'claude' ? t('usage.unsupported.claude') : t('usage.unsupported.other')}</Note>
    if (!windows.length) return <Note>{planLimits.unavailable?.reason === 'probeFailed' ? t('usage.probeFailed') : t('usage.empty')}</Note>

    return (
        <div className="space-y-2">
            {planLimits.refreshFailedAt && (
                <p className="flex items-start gap-1.5 text-[11px] text-orange-600 dark:text-orange-400">
                    <AlertTriangle className="mt-px size-3 shrink-0" />
                    {t('usage.refreshFailed', { age: shortRelativeTime(planLimits.capturedAt, locale) })}
                </p>
            )}
            <div className="space-y-4 rounded-md border bg-muted/20 p-3">
                {planLimits.plan && <span className="inline-flex rounded-sm border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{t('usage.plan', { plan: planLimits.plan.charAt(0).toUpperCase() + planLimits.plan.slice(1) })}</span>}
                {windows.map(window => (
                    <WindowRow key={window.id ?? `${window.kind}:${window.label ?? ''}`} window={window} provider={connection.provider} now={now} />
                ))}
                {planLimits.extraUsage && <ExtraUsageRow extra={planLimits.extraUsage} />}
            </div>
        </div>
    )
}

const PACE_TONES: Record<LimitPace, string> = {
    ahead: 'text-amber-600 dark:text-amber-400',
    on: 'text-muted-foreground',
    under: 'text-emerald-600 dark:text-emerald-400',
}

// The bar is what is used, the tick how much of the window has gone by: a bar past its tick runs out
// before the reset. The reset is written out in full, the tooltip only adds the exact moment.
function WindowRow({ window, provider, now }: { window: PlanLimitWindow; provider: string; now: number }) {
    const t = useTranslations('connections')
    const locale = useLocale()
    const name = planWindowName(window, t, provider)
    const elapsed = elapsedShare(window, now)
    const pace = paceOf(window, now)
    const used = Math.round(window.usedPercent)

    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground tabular-nums">
                    {t.rich('usage.leftAndUsed', { left: remainingPercent(window), used, strong: chunks => <span className="font-medium text-foreground">{chunks}</span> })}
                </span>
            </div>
            <div className="relative">
                <PlanLimitMeter percent={window.usedPercent} label={t('meter.planLimit', { name })} />
                {elapsed !== null && (
                    <span
                        role="img"
                        aria-label={t('usage.paceTick', { percent: Math.round(elapsed * 100) })}
                        className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground/60"
                        style={{ left: `${elapsed * 100}%` }}
                    />
                )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {window.resetsAt ? (
                    <TooltipLabeled label={t('usage.resetsOn', { date: fullDateTime(window.resetsAt, locale) })}>
                        <span tabIndex={0} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                            {t('usage.resets', { when: shortUntil(window.resetsAt, locale, new Date(now)), date: formatDate(window.resetsAt, locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })}
                        </span>
                    </TooltipLabeled>
                ) : (
                    <span>{t('usage.resetUnknown')}</span>
                )}
                {pace && <span className={cn('font-medium', PACE_TONES[pace])}>{t(`usage.pace.${pace}`)}</span>}
            </div>
        </div>
    )
}

function ExtraUsageRow({ extra }: { extra: PlanExtraUsage }) {
    const t = useTranslations('connections')
    const title = t('usage.extra.title')
    const status = !extra.enabled ? t('usage.extra.off') : extra.zeroCap ? t('usage.extra.zeroCap') : extra.usedPercent !== null ? t('usage.extra.used', { percent: Math.round(extra.usedPercent) }) : t('usage.extra.on')

    return (
        <div className="space-y-1.5 border-t pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                <span className="font-medium">{title}</span>
                <span className="text-muted-foreground tabular-nums">{status}</span>
            </div>
            {extra.enabled && !extra.zeroCap && extra.usedPercent !== null && <PlanLimitMeter percent={extra.usedPercent} label={t('meter.planLimit', { name: title })} />}
            <p className="text-[11px] text-muted-foreground">{t('usage.extra.hint')}</p>
        </div>
    )
}

function Note({ children }: { children: string }) {
    return <p className="rounded-md border border-dashed px-3 py-2.5 text-[11px] text-muted-foreground">{children}</p>
}

function PlanLimitsSkeleton() {
    return (
        <div className="space-y-4 rounded-md border bg-muted/20 p-3">
            {['w-16', 'w-14'].map(width => (
                <div key={width} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                        <Skeleton className={cn('h-3', width)} />
                        <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                    <Skeleton className="h-2.5 w-36" />
                </div>
            ))}
        </div>
    )
}
