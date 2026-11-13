'use client'

import { useCallback, useRef } from 'react'

import { ChatComposer, type ChatComposerHandle } from '@/components/chat/ChatComposer'
import { ChannelMentionMenu } from '@/components/channels/ChannelMentionMenu'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import { mentionsIn, useChannelMentions, type MentionCandidate } from '@/components/channels/useChannelMentions'
import type { Draft } from '@/components/channels/useChannelMessages'
import { cn } from '@/lib/utils'
import { selectStewardOpen, selectStewardVisible, useStewardStore } from '@/stores/steward.store'

const SHARED_UPLOADS = { kind: 'shared' } as const

type ChannelComposerProps = {
    // Namespaces the draft kept in the browser: one per channel and per thread.
    uid: string
    placeholder: string
    candidates: MentionCandidate[]
    directory: ChannelDirectory
    onSend: (draft: Draft) => void
}

// The chat composer of the app, without attachments nor voice for now, with `@` over the people and
// coworkers of the channel.
export function ChannelComposer({ uid, placeholder, candidates, directory, onSend }: ChannelComposerProps) {
    const composerRef = useRef<ChatComposerHandle>(null)
    const sync = useCallback((text: string) => composerRef.current?.sync(text), [])
    const mentions = useChannelMentions(candidates, sync)
    // The Steward parked in the bottom corner sits over the send button: the composer makes room.
    const stewardParked = useStewardStore(state => selectStewardVisible(state) && !selectStewardOpen(state))

    return (
        <div className={cn('relative', stewardParked && 'pr-14')}>
            {mentions.open && <ChannelMentionMenu items={mentions.items} highlight={mentions.highlight} directory={directory} onHover={mentions.setHighlight} onPick={mentions.pick} />}
            <ChatComposer
                ref={composerRef}
                uid={uid}
                uploadTarget={SHARED_UPLOADS}
                status="ready"
                busy={false}
                attachmentsEnabled={false}
                voiceEnabled={false}
                textareaRef={mentions.inputRef}
                textareaProps={mentions.textareaProps}
                mentionTokens={mentions.tokens}
                placeholder={placeholder}
                onSend={text => onSend({ body: text, mentions: mentionsIn(text, candidates) })}
            />
        </div>
    )
}
