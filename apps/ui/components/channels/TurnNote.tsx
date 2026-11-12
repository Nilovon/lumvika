'use client'

import { AgentBuddy } from '@lumvika/ui/iso-grid'
import { useTranslations } from 'next-intl'

import type { ChannelAgentTurn } from '@/app/api/_services/work/channel-coworkers.service'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { isAnswering } from '@/components/channels/channel-rows'
import { AlertCircleIcon } from '@/lib/icons'

// What a coworker asked to answer is doing, read from the turn everyone in the channel sees: still
// answering, or the reason it could not. An answered turn says nothing, its reply speaks for it.
export function TurnNote({ turn, coworkerName }: { turn: ChannelAgentTurn; coworkerName: string }) {
    const t = useTranslations('channels.coworker')
    if (isAnswering(turn)) {
        return (
            <div className="flex items-center gap-2 py-1 text-xs" role="status">
                <AgentBuddy agentId={turn.agentId} size={18} animated facing="right" />
                <Shimmer as="span" className="text-xs">
                    {t('answering', { name: coworkerName })}
                </Shimmer>
            </div>
        )
    }
    if (turn.status !== 'failed') return null
    return (
        <div className="my-1 flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground" role="note">
            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">{t(`failed.${turn.failure ?? 'failed'}`, { name: coworkerName })}</span>
        </div>
    )
}
