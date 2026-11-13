'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslations } from 'next-intl'

export const MY_WORK_TABS = ['assigned', 'created', 'coworkers'] as const
export type MyWorkTab = (typeof MY_WORK_TABS)[number]

export function MyWorkTabs({ value, onChange, counts }: { value: MyWorkTab; onChange: (tab: MyWorkTab) => void; counts: Record<MyWorkTab, number> | null }) {
    const t = useTranslations('work.tabs')
    return (
        <Tabs value={value} onValueChange={next => onChange(next as MyWorkTab)}>
            <TabsList aria-label={t('label')} className="h-9 gap-0">
                {MY_WORK_TABS.map(tab => (
                    <TabsTrigger key={tab} value={tab} className="gap-1.5">
                        {t(tab)}
                        {counts && counts[tab] > 0 && <span className="text-xs text-muted-foreground tabular-nums">{counts[tab]}</span>}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    )
}
