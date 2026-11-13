'use client'

import { BudgetExhaustedNotice, usePriceArm } from '@lumvika/cloud/billing.client'
import { isLifetimePlan, isSubscriptionEntitled } from '@lumvika/cloud/billing'

import { ProviderErrorNotice } from '@/components/chat/ProviderErrorNotice'
import type { ChatErrorKind } from '@/lib/chat-error'
import { useSession } from '@/lib/auth/session/SessionProvider'

type AssistantErrorNoticeProps = {
    kind: ChatErrorKind
    message: string
    onStop: () => void
    onSwitchModel: () => void
    onOpenConnections: () => void
    onNewChat: () => void
}

// A failed turn says what happened and offers the move that fixes it, the way a coworker's chat does.
export function AssistantErrorNotice({ kind, message, onStop, onSwitchModel, onOpenConnections, onNewChat }: AssistantErrorNoticeProps) {
    const { workspace } = useSession()
    const priceArm = usePriceArm()
    if (kind === 'budget') {
        return <BudgetExhaustedNotice preTrial={!isSubscriptionEntitled(workspace?.subscription_status)} trialing={workspace?.subscription_status === 'trialing'} paused={!!workspace?.lumvika_credit_paused_at} lifetime={isLifetimePlan(workspace)} priceArm={priceArm} />
    }
    return <ProviderErrorNotice kind={kind} message={message} onStopRun={onStop} onSwitchModel={onSwitchModel} onOpenConnections={onOpenConnections} onReconnect={onOpenConnections} onNewConversation={onNewChat} />
}
