'use client'

import { useState, type RefObject } from 'react'
import type { BorderBeamProps } from '@lumvika/ui'

import { StewardPill, type StewardPillSide } from './StewardPill'
import { StewardPillField } from './StewardPillField'
import { StewardPillTicker } from './StewardPillTicker'
import { StewardPillVoice, type StewardVoicePhase } from './StewardPillVoice'

export type StewardDockPillMode = { kind: 'field' } | { kind: 'ticker'; label: string | null } | { kind: 'voice'; phase: StewardVoicePhase; stream: MediaStream | null }

const REST_WIDTH = 'w-[340px]'
const TICKER_WIDTH = 'w-[420px]'
const WRITING_WIDTH = 'w-[480px]'

type StewardDockPillProps = {
    side: StewardPillSide
    mode: StewardDockPillMode
    tone?: BorderBeamProps['tone']
    hidden?: boolean
    mod: string
    inputRef: RefObject<HTMLInputElement | null>
    onSubmit: (text: string) => void
    /** The field took the caret: whatever it needs to send had better be on its way. */
    onEngage: () => void
}

/** The pill in whichever of its three lives the Steward is in: a field, its run, or a voice. */
export function StewardDockPill({ side, mode, tone, hidden, mod, inputRef, onSubmit, onEngage }: StewardDockPillProps) {
    const [draft, setDraft] = useState('')
    const [focused, setFocused] = useState(false)
    const writing = mode.kind === 'field' && (focused || draft.length > 0)
    const width = mode.kind === 'voice' || writing ? WRITING_WIDTH : mode.kind === 'ticker' ? TICKER_WIDTH : REST_WIDTH

    return (
        <StewardPill side={side} width={width} tone={tone} hidden={hidden}>
            {mode.kind === 'voice' ? (
                <StewardPillVoice phase={mode.phase} stream={mode.stream} />
            ) : mode.kind === 'ticker' ? (
                <StewardPillTicker label={mode.label} />
            ) : (
                <StewardPillField
                    inputRef={inputRef}
                    mod={mod}
                    draft={draft}
                    focused={focused}
                    onDraftChange={setDraft}
                    onFocusChange={setFocused}
                    onEngage={onEngage}
                    onSubmit={() => {
                        const text = draft.trim()
                        if (!text) return
                        setDraft('')
                        onSubmit(text)
                    }}
                />
            )}
        </StewardPill>
    )
}
