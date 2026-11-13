'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslations } from 'next-intl'

export type TeamsTab = 'teams' | 'org'

const TABS: readonly TeamsTab[] = ['teams', 'org']

export function TeamsTabs({ value, onChange }: { value: TeamsTab; onChange: (tab: TeamsTab) => void }) {
    const t = useTranslations('teams.tabs')
    return (
        <Tabs value={value} onValueChange={next => onChange(next as TeamsTab)}>
            <TabsList aria-label={t('label')} className="h-9 gap-0">
                {TABS.map(tab => (
                    <TabsTrigger key={tab} value={tab}>
                        {t(tab)}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    )
}
