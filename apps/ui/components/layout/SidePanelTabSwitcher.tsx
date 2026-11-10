'use client'

import { Segmented } from '@/components/ui/segmented'
import type { ComponentType } from 'react'

export type SidePanelSwitcherTab<T extends string> = {
    id: T
    icon: ComponentType<{ className?: string }>
    label: string
    dot?: boolean
}

export function SidePanelTabSwitcher<T extends string>({ tabs, value, onChange }: { tabs: SidePanelSwitcherTab<T>[]; value: T; onChange: (id: T) => void }) {
    if (tabs.length < 2) return null
    return (
        <div className="border-b border-border px-3 py-2">
            <Segmented
                value={value}
                onChange={onChange}
                options={tabs.map(tab => {
                    const TabIcon = tab.icon
                    return {
                        value: tab.id,
                        label: tab.label,
                        content: (
                            <span className="flex items-center gap-1.5">
                                <TabIcon className="size-3.5" />
                                {tab.label}
                                {tab.dot && <span className="size-1.5 rounded-full bg-red-500" />}
                            </span>
                        ),
                    }
                })}
            />
        </div>
    )
}
