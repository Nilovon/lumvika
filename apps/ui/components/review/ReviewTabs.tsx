'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslations } from 'next-intl'

export const REVIEW_TABS = ['toReview', 'blocked', 'conversations'] as const
export type ReviewTab = (typeof REVIEW_TABS)[number]

export function ReviewTabs({ value, onChange, counts }: { value: ReviewTab; onChange: (tab: ReviewTab) => void; counts: Partial<Record<ReviewTab, number>> }) {
    const t = useTranslations('review.tabs')
    return (
        <Tabs value={value} onValueChange={next => onChange(next as ReviewTab)}>
            <TabsList aria-label={t('label')} className="h-9 gap-0">
                {REVIEW_TABS.map(tab => (
                    <TabsTrigger key={tab} value={tab} className="gap-1.5">
                        {t(tab)}
                        {!!counts[tab] && <span className="text-xs text-muted-foreground tabular-nums">{counts[tab]}</span>}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    )
}
