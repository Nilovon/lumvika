'use client'

import { readTokenUsageAction } from '@/app/api/_actions/workspace-connection.actions'
import { DetailBlock } from '@/components/connections/DetailBlock'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { PLAN_LABELS, type AddableProvider } from '@/lib/engine/ai-sources'
import { cacheHitRate, tokenUsageOf, uncachedInputTokens } from '@/lib/engine/plan-usage'
import { cn } from '@/lib/utils'
import { PROVIDER_LABELS, TOKEN_USAGE_RANGES, type Provider, type TokenUsage, type TokenUsageRange, type TokenUsageTotals } from '@lumvika/contracts'
import { formatNumber } from '@lumvika/i18n/format'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

const TOP_AGENTS = 5

// `undefined` while a range loads, `null` on an engine older than the breakdown.
type Loaded = Partial<Record<TokenUsageRange, TokenUsage | null>>

// What the runs on this provider went through: how much of their input the prompt cache served,
// which is what a subscription's limits are spent on. Read from the engine's own run records.
export function TokenUsageBlock({ provider }: { provider: Provider }) {
    const t = useTranslations('connections')
    const [range, setRange] = useState<TokenUsageRange>('7d')
    const [loaded, setLoaded] = useState<Loaded>({})
    const [failed, setFailed] = useState(false)
    const usage = loaded[range]

    useEffect(() => {
        if (usage !== undefined) return
        let cancelled = false
        void readTokenUsageAction(range).then(result => {
            if (cancelled) return
            if (result.success) setLoaded(previous => ({ ...previous, [range]: result.usage }))
            else setFailed(true)
        })
        return () => {
            cancelled = true
        }
    }, [range, usage])

    const providerName = PLAN_LABELS[provider as AddableProvider] ?? PROVIDER_LABELS[provider]
    const rangePicker = <Segmented className="w-40" options={TOKEN_USAGE_RANGES.map(value => ({ value, label: t(`tokens.range.${value}`) }))} value={range} onChange={setRange} />

    return (
        <DetailBlock title={t('tokens.title')} aside={rangePicker}>
            {failed ? (
                <Note>{t('tokens.unavailable')}</Note>
            ) : usage === undefined ? (
                <TokenUsageSkeleton />
            ) : usage === null ? (
                <Note>{t('tokens.unavailable')}</Note>
            ) : (
                <TokenUsageBody entry={tokenUsageOf(usage, provider)} providerName={providerName} />
            )}
        </DetailBlock>
    )
}

function TokenUsageBody({ entry, providerName }: { entry: ReturnType<typeof tokenUsageOf>; providerName: string }) {
    const t = useTranslations('connections')
    const locale = useLocale()
    if (!entry || entry.totals.runCount === 0) return <Note>{t('tokens.empty', { provider: providerName })}</Note>

    const { totals } = entry
    const tokens = (value: number) => formatNumber(value, locale, { notation: 'compact', maximumFractionDigits: 1 })
    const rate = (value: TokenUsageTotals) => formatNumber(cacheHitRate(value) ?? 0, locale, { style: 'percent', maximumFractionDigits: 0 })
    const stats = [
        { label: t('tokens.input'), value: tokens(totals.inputTokens) },
        { label: t('tokens.output'), value: tokens(totals.outputTokens) },
        { label: t('tokens.cacheRead'), value: tokens(totals.cacheReadTokens) },
        { label: t('tokens.cacheWrite'), value: tokens(totals.cacheWriteTokens) },
        { label: t('tokens.hitRate'), value: rate(totals) },
        { label: t('tokens.runs'), value: formatNumber(totals.runCount, locale) },
        ...(totals.costMicros > 0 ? [{ label: t('tokens.cost'), value: formatNumber(totals.costMicros / 1_000_000, locale, { style: 'currency', currency: 'USD' }) }] : []),
    ]

    return (
        <div className="space-y-3">
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    {stats.map(stat => (
                        <div key={stat.label} className="min-w-0">
                            <dt className="truncate text-[11px] text-muted-foreground">{stat.label}</dt>
                            <dd className="text-sm font-medium tabular-nums">{stat.value}</dd>
                        </div>
                    ))}
                </dl>
                <InputComposition totals={totals} format={tokens} />
            </div>
            {entry.agents.length > 0 && (
                <div className="space-y-1.5">
                    <h4 className="text-xs font-medium text-muted-foreground">{t('tokens.byAgent')}</h4>
                    <ul className="divide-y rounded-md border">
                        {entry.agents.slice(0, TOP_AGENTS).map(agent => (
                            <li key={agent.agentId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-xs">
                                <span className="min-w-0 truncate font-medium">{agent.agentName}</span>
                                <span className="text-muted-foreground tabular-nums">{t('tokens.agentLine', { input: tokens(agent.inputTokens), output: tokens(agent.outputTokens), rate: rate(agent) })}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <p className="text-[11px] text-muted-foreground">{t('tokens.note', { provider: providerName })}</p>
        </div>
    )
}

// The input split three ways: what the provider read fresh, what the cache served, what it stored.
function InputComposition({ totals, format }: { totals: TokenUsageTotals; format: (value: number) => string }) {
    const t = useTranslations('connections')
    const uncached = uncachedInputTokens(totals)
    const whole = uncached + totals.cacheReadTokens + totals.cacheWriteTokens
    if (whole <= 0) return null
    const parts = [
        { key: 'uncached', label: t('tokens.uncached'), value: uncached, tone: 'bg-muted-foreground/50' },
        { key: 'read', label: t('tokens.cacheRead'), value: totals.cacheReadTokens, tone: 'bg-brand' },
        { key: 'write', label: t('tokens.cacheWrite'), value: totals.cacheWriteTokens, tone: 'bg-amber-500' },
    ]

    return (
        <div className="space-y-1.5">
            <div role="img" aria-label={t('tokens.composition', { uncached: format(uncached), read: format(totals.cacheReadTokens), write: format(totals.cacheWriteTokens) })} className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/15">
                {parts.map(part => (
                    <span key={part.key} className={part.tone} style={{ width: `${(part.value / whole) * 100}%` }} />
                ))}
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {parts.map(part => (
                    <li key={part.key} className="flex items-center gap-1.5">
                        <span className={cn('size-2 rounded-full', part.tone)} />
                        {part.label}
                    </li>
                ))}
            </ul>
        </div>
    )
}

function Note({ children }: { children: string }) {
    return <p className="rounded-md border border-dashed px-3 py-2.5 text-[11px] text-muted-foreground">{children}</p>
}

function TokenUsageSkeleton() {
    return (
        <div className="space-y-3">
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    {['w-10', 'w-12', 'w-16', 'w-16', 'w-20', 'w-10'].map((width, i) => (
                        <div key={i} className="space-y-1.5">
                            <Skeleton className={cn('h-2.5', width)} />
                            <Skeleton className="h-4 w-12" />
                        </div>
                    ))}
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-3/4" />
        </div>
    )
}
