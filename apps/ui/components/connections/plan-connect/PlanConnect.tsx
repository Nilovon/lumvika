'use client'

import type { AiConnectionSurface } from '@lumvika/analytics'

import type { SubscriptionProvider } from '@/components/agent/ModelPickerProviders'
import { useClaudeOAuth } from '@/components/connections/use-claude-oauth'
import { useCodexDeviceAuth } from '@/components/connections/use-codex-device-auth'

import { ChatGptPlanSteps } from './ChatGptPlanSteps'
import { ClaudePlanSteps } from './ClaudePlanSteps'
import type { TrackStep } from './StewardTrack'

type PlanConnectProps = {
    provider: SubscriptionProvider
    // Where the token lands: a new connection, or an existing one signed in again.
    onKeys: (keys: Record<string, string>) => Promise<{ success: boolean; error?: string }>
    surface: AiConnectionSurface
    lastStep: (linked: boolean) => TrackStep
}

export function PlanConnect({ provider, ...props }: PlanConnectProps) {
    return provider === 'claude' ? <ClaudePlanConnect {...props} /> : <ChatGptPlanConnect {...props} />
}

type ProviderConnectProps = Omit<PlanConnectProps, 'provider'>

function ClaudePlanConnect({ onKeys, surface, lastStep }: ProviderConnectProps) {
    const oauth = useClaudeOAuth(onKeys, surface)
    return <ClaudePlanSteps oauth={oauth} lastStep={lastStep} />
}

function ChatGptPlanConnect({ onKeys, surface, lastStep }: ProviderConnectProps) {
    const auth = useCodexDeviceAuth(onKeys, surface)
    return <ChatGptPlanSteps auth={auth} lastStep={lastStep} />
}
