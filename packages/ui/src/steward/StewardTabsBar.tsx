'use client'

import { Tabs, TabsList, TabsTrigger } from '../primitives'
import { TooltipDisabledReason } from '../Tooltip'
import { useKitTranslations } from '../locale'

export type StewardTab = 'assistant' | 'tasks' | 'routines'

export const STEWARD_TABS: readonly { id: StewardTab; disabledReason?: string }[] = [{ id: 'assistant' }, { id: 'routines' }]

export function StewardTabsBar({ tab, onTabChange }: { tab: StewardTab; onTabChange: (tab: StewardTab) => void }) {
    const t = useKitTranslations()
    return (
        <Tabs value={tab} onValueChange={value => onTabChange(value as StewardTab)} className="mx-2 border-b border-border">
            <TabsList aria-label="Steward" className="h-9 gap-0">
                {STEWARD_TABS.map(({ id, disabledReason }) => (
                    <TooltipDisabledReason key={id} reason={disabledReason} side="bottom" className="h-full rounded-md">
                        <TabsTrigger value={id} disabled={Boolean(disabledReason)}>
                            {t(`steward.tabs.${id}`)}
                        </TabsTrigger>
                    </TooltipDisabledReason>
                ))}
            </TabsList>
        </Tabs>
    )
}
