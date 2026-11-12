'use client'

import { AgentBuddy } from '@lumvika/ui/iso-grid'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import { Button } from '@/components/ui/button'
import { XIcon } from '@/lib/icons'

// A coworker a message mentioned but that is not in the channel: who may add it (anyone in a public
// channel, its manager in a private one) adds it, and it answers the message that asked for it.
export type OutsiderOffer = { agentId: string; messageId: string; canAdd: boolean }

type OutsiderPromptProps = {
    offers: OutsiderOffer[]
    directory: ChannelDirectory
    onAdd: (offer: OutsiderOffer) => Promise<boolean>
    onDismiss: (agentId: string) => void
}

export function OutsiderPrompt({ offers, directory, onAdd, onDismiss }: OutsiderPromptProps) {
    const t = useTranslations('channels.coworker')
    const [adding, setAdding] = useState<string | null>(null)
    if (offers.length === 0) return null

    return (
        <div className="mb-2 space-y-1.5">
            {offers.map(offer => {
                const name = directory.coworker(offer.agentId)?.name ?? '…'
                return (
                    <div key={offer.agentId} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs" role="status">
                        <AgentBuddy agentId={offer.agentId} size={20} animated={false} facing="right" />
                        <span className="min-w-0 flex-1 basis-48 text-muted-foreground">{offer.canAdd ? t('outsider', { name }) : t('outsiderManagerOnly', { name })}</span>
                        <div className="ml-auto flex items-center gap-1">
                            {offer.canAdd && (
                                <Button
                                    type="button"
                                    size="xs"
                                    loading={adding === offer.agentId}
                                    onClick={async () => {
                                        setAdding(offer.agentId)
                                        const added = await onAdd(offer)
                                        setAdding(null)
                                        if (added) onDismiss(offer.agentId)
                                    }}
                                >
                                    {t('addOutsider')}
                                </Button>
                            )}
                            <Button type="button" size="icon-xs" variant="ghost" aria-label={t('dismiss')} onClick={() => onDismiss(offer.agentId)}>
                                <XIcon />
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
