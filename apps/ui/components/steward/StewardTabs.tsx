'use client'

import { useStewardStore } from '@/stores/steward.store'
import { StewardTabsBar } from '@lumvika/ui/steward'

export function StewardTabs() {
    const tab = useStewardStore(state => state.tab)
    const setTab = useStewardStore(state => state.setTab)

    return <StewardTabsBar tab={tab} onTabChange={setTab} />
}
