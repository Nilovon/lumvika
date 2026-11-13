'use client'

import { OverviewCard } from '@/components/overview/OverviewCard'
import { Button } from '@/components/ui/button'
import { dayOf } from '@/components/issues/issue-dates'
import { throughputDays } from '@/lib/work/throughput'
import { formatDate, formatNumber } from '@lumvika/i18n/format'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@lumvika/ui/primitives/chart'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

// Slots 1 and 2 of the categorical palette, each stepped for its surface (validated light on the card,
// dark on the dark card): identity, never a status.
const SERIES_COLORS = {
    created: { light: '#2a78d6', dark: '#3987e5' },
    completed: { light: '#eb6834', dark: '#d95926' },
} as const

const SERIES = ['created', 'completed'] as const

function Swatch({ series }: { series: (typeof SERIES)[number] }) {
    return <span aria-hidden className="size-2.5 shrink-0 rounded-[3px] bg-(--swatch-light) dark:bg-(--swatch-dark)" style={{ ['--swatch-light' as string]: SERIES_COLORS[series].light, ['--swatch-dark' as string]: SERIES_COLORS[series].dark }} />
}

// Issues created against issues completed, per day of the reader's calendar, over two weeks. One
// scale, two series side by side; a table carries the same numbers for whoever cannot read the bars.
export function ThroughputChart({ created, completed }: { created: string[]; completed: string[] }) {
    const t = useTranslations('overview.throughput')
    const locale = useLocale()
    const [asTable, setAsTable] = useState(false)
    const days = useMemo(() => throughputDays(created, completed), [created, completed])
    const rows = useMemo(() => days.map(day => ({ ...day, label: formatDate(dayOf(day.day), locale, { day: 'numeric', month: 'short' }) })), [days, locale])
    const totals = { created: days.reduce((sum, day) => sum + day.created, 0), completed: days.reduce((sum, day) => sum + day.completed, 0) }
    const config: ChartConfig = { created: { label: t('created'), theme: SERIES_COLORS.created }, completed: { label: t('completed'), theme: SERIES_COLORS.completed } }

    return (
        <OverviewCard
            title={t('title')}
            description={t('description')}
            action={
                <Button type="button" size="xs" variant="ghost" onClick={() => setAsTable(value => !value)} className="text-muted-foreground">
                    {asTable ? t('showChart') : t('showTable')}
                </Button>
            }
        >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {SERIES.map(series => (
                    <span key={series} className="inline-flex items-center gap-1.5">
                        <Swatch series={series} />
                        <span className="text-foreground">{t(series)}</span>
                        <span className="tabular-nums">{formatNumber(totals[series], locale)}</span>
                    </span>
                ))}
            </div>
            {asTable ? (
                <div className="max-h-64 overflow-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                            <tr>
                                <th scope="col" className="px-3 py-1.5 text-left font-medium">
                                    {t('day')}
                                </th>
                                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                                    {t('created')}
                                </th>
                                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                                    {t('completed')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="tabular-nums">
                            {[...rows].reverse().map(row => (
                                <tr key={row.day} className="border-t border-border">
                                    <th scope="row" className="px-3 py-1.5 text-left font-normal text-muted-foreground">
                                        {row.label}
                                    </th>
                                    <td className="px-3 py-1.5 text-right">{row.created}</td>
                                    <td className="px-3 py-1.5 text-right">{row.completed}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <ChartContainer config={config} className="aspect-auto h-44 w-full" role="img" aria-label={t('summary', totals)}>
                    <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} minTickGap={12} interval="preserveStartEnd" />
                        <YAxis tickLine={false} axisLine={false} width={24} allowDecimals={false} />
                        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent indicator="dot" />} />
                        {SERIES.map(series => (
                            <Bar key={series} dataKey={series} fill={`var(--color-${series})`} radius={[4, 4, 0, 0]} maxBarSize={12} />
                        ))}
                    </BarChart>
                </ChartContainer>
            )}
        </OverviewCard>
    )
}
