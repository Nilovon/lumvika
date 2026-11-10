'use client'

import type { ChatStatus } from 'ai'
import { STEWARD_AGENT_ID, MAX_UPLOAD_FILE_BYTES } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useMemo, type ComponentProps, type RefObject } from 'react'

import { Context } from '@/components/ai-elements/context'
import { ChatComposer, type ChatComposerHandle, type ComposerQueue } from '@/components/chat/ChatComposer'
import { StewardModelPill } from '@/components/steward/StewardModelPill'
import type { ContextStats } from '@/lib/chat/context-stats'
import { modelContextWindow } from '@/lib/engine/models'
import type { StewardBackend } from '@/lib/steward/phase'
import { STEWARD_MAX_UPLOAD_BYTES } from '@/lib/steward/upload-limit'

export type StewardComposerProps = {
    sessionId: string
    backend: StewardBackend
    status: ChatStatus
    busy: boolean
    queue: ComposerQueue
    onSend: (text: string) => void
    onStop: () => void
    onUploadingChange: (uploading: boolean) => void
    composerRef: RefObject<ChatComposerHandle | null>
    /** The engine takes the steward's files in its own workspace. Without it they stay on the hub. */
    filesOnEngine: boolean
    contextStats: ContextStats | null
    /**
     * Stands under the welcome card or the starter pack, where what is written answers the card: it
     * reads as that way out, and takes no file, which the card would have nowhere to put.
     */
    ownEntry?: boolean
} & StewardComposerMentionProps

export type StewardComposerMentionProps = Pick<ComponentProps<typeof ChatComposer>, 'textareaRef' | 'textareaProps' | 'mentionTokens'>

export function StewardComposer({ sessionId, backend, status, busy, queue, onSend, onStop, onUploadingChange, composerRef, filesOnEngine, contextStats, ownEntry = false, textareaRef, textareaProps, mentionTokens }: StewardComposerProps) {
    // On the engine a file lands in the steward's own workspace, where its tools can open the path
    // the message names. The hub steward reads its files from the hub's bucket.
    const t = useTranslations('steward')
    const onEngineFiles = backend === 'engine' && filesOnEngine
    const uploadTarget = useMemo(() => (onEngineFiles ? ({ kind: 'agent', agentId: STEWARD_AGENT_ID } as const) : ({ kind: 'steward', sessionId } as const)), [onEngineFiles, sessionId])

    return (
        <ChatComposer
            ref={composerRef}
            uid="steward"
            uploadTarget={uploadTarget}
            maxFileSize={onEngineFiles ? MAX_UPLOAD_FILE_BYTES : STEWARD_MAX_UPLOAD_BYTES}
            status={status}
            busy={busy}
            queue={queue}
            onSend={onSend}
            onStop={onStop}
            onUploadingChange={onUploadingChange}
            textareaRef={textareaRef}
            textareaProps={textareaProps}
            mentionTokens={mentionTokens}
            // An engine that predates the steward's file routes would be handed a path it cannot
            // open.
            attachmentsEnabled={!ownEntry && (backend === 'hub' || filesOnEngine)}
            {...(ownEntry ? { placeholder: t('ownEntryPlaceholder') } : {})}
            modelSlot={<StewardModelPill backend={backend} />}
            contextSlot={contextStats && <Context usedTokens={contextStats.used} maxTokens={contextStats.max ?? modelContextWindow(contextStats.model, contextStats.provider)} usage={contextStats.usage} modelId={contextStats.model} />}
        />
    )
}
