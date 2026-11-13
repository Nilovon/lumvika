'use client'

import { STEWARD_AGENT_ID } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'

import { ModelPillTrigger } from '@/components/agent/ModelPillTrigger'
import { ModelSelector } from '@/components/agent/ModelSelector'
import { TooltipDisabledReason } from '@/components/ui/tooltip'
import type { StewardBackend } from '@/lib/steward/phase'
import { selectStewardOpen, useStewardStore } from '@/stores/steward.store'

// The hub steward runs on the shared Lumvika key: the subscriptions plugged into the machine never
// leave it, so its pill is disabled rather than hidden and still says which model is answering. The
// engine steward picks its model like any agent of the Box.
// The column stays mounted while closed, and a picker reads the steward from the Box and the
// machine's connections on mount: nothing to read for a pill nobody can see.
export function StewardModelPill({ backend }: { backend: StewardBackend }) {
    const t = useTranslations('steward.modelPill')
    const open = useStewardStore(selectStewardOpen)
    if (backend === 'engine') return open ? <ModelSelector agentId={STEWARD_AGENT_ID} /> : null
    return (
        <TooltipDisabledReason reason={t('hubReason')}>
            <ModelPillTrigger provider="lumvika" label="Lumvika Balanced" disabled />
        </TooltipDisabledReason>
    )
}
