'use client'

import { ASSISTANT_AGENT_ID } from '@lumvika/contracts'
import type { ChatStatus } from 'ai'
import { useTranslations } from 'next-intl'
import type { ReactNode, RefObject } from 'react'

import { ModelSelector } from '@/components/agent/ModelSelector'
import { ChatComposer, type ChatComposerHandle } from '@/components/chat/ChatComposer'

// Attachments and voice stay off: the assistant has no files of its own to read them from, and a
// workspace it shares with every member is no place to drop one person's files.
const NO_UPLOADS = { kind: 'shared' } as const

type AssistantComposerProps = {
    uid: string
    selectionKey: string
    isAdmin: boolean
    status: ChatStatus
    busy: boolean
    onSend: (text: string) => void
    onStop: () => void
    composerRef: RefObject<ChatComposerHandle | null>
    // Before the model picker: the project chip of a chat not started yet.
    leading?: ReactNode
}

export function AssistantComposer({ uid, selectionKey, isAdmin, status, busy, onSend, onStop, composerRef, leading }: AssistantComposerProps) {
    const t = useTranslations('assistant.conversation')
    return (
        <ChatComposer
            ref={composerRef}
            uid={uid}
            uploadTarget={NO_UPLOADS}
            status={status}
            busy={busy}
            onSend={onSend}
            onStop={onStop}
            attachmentsEnabled={false}
            voiceEnabled={false}
            placeholder={t('placeholder')}
            modelSlot={
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {leading}
                    <ModelSelector agentId={ASSISTANT_AGENT_ID} selectionKey={selectionKey} pickerKey={selectionKey} canSetDefault={isAdmin} />
                </div>
            }
        />
    )
}
