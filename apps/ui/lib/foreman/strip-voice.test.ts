import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { appendAttachmentsRef, buildAttachmentsRef } from '@/lib/chat/attachments-marker'
import { appendVoiceMarker, buildVoiceMarker } from '@/lib/voice/marker'

import { withoutVoiceMarkers } from './strip-voice'

const marker = buildVoiceMarker({ src: 'chat-uploads/mf2x-abc123-voice.webm', durationMs: 4210, levels: [0.2, 0.9] })

const user = (text: string): UIMessage => ({ id: 'm1', role: 'user', parts: [{ type: 'text', text }] }) as UIMessage

const textOf = (message: UIMessage): string =>
    message.parts
        .filter(part => part.type === 'text')
        .map(part => (part as { text: string }).text)
        .join('')

describe('withoutVoiceMarkers', () => {
    it('hands the model the transcript alone', () => {
        const [message] = withoutVoiceMarkers([user(appendVoiceMarker('Ship it tomorrow', marker))])
        expect(textOf(message)).toBe('Ship it tomorrow')
    })

    it('keeps the attachments that were sent with the recording', () => {
        const ref = buildAttachmentsRef(['chat-uploads/mf2x-def456-brief.pdf'])
        const [message] = withoutVoiceMarkers([user(appendAttachmentsRef(appendVoiceMarker('Read this brief', marker), ref))])
        expect(textOf(message)).toBe(appendAttachmentsRef('Read this brief', ref))
    })

    it('leaves the message that will be persisted untouched', () => {
        const input = [user(appendVoiceMarker('Ship it tomorrow', marker))]
        const next = withoutVoiceMarkers(input)
        expect(textOf(input[0])).toContain('<voice src=')
        expect(next[0]).not.toBe(input[0])
    })

    it('gives back the same array when nothing was dictated', () => {
        const messages = [user('Ship it tomorrow\n')]
        expect(withoutVoiceMarkers(messages)).toBe(messages)
    })

    it('ignores a marker that is not the end of the message', () => {
        const messages = [user(`${marker}\n\ntrailing text`)]
        expect(withoutVoiceMarkers(messages)).toBe(messages)
    })

    it('leaves a marker with no transcript in front of it alone', () => {
        const messages = [user(marker)]
        expect(withoutVoiceMarkers(messages)).toBe(messages)
    })

    it('rewrites the last text part and preserves the others', () => {
        const message = {
            id: 'm1',
            role: 'user',
            parts: [{ type: 'text', text: 'Context' }, { type: 'text', text: appendVoiceMarker('Ship it', marker) }, { type: 'step-start' }],
        } as unknown as UIMessage
        const [next] = withoutVoiceMarkers([message])
        expect(next.parts[0]).toEqual({ type: 'text', text: 'Context' })
        expect(next.parts[1]).toEqual({ type: 'text', text: 'Ship it' })
        expect(next.parts[2]).toEqual({ type: 'step-start' })
    })

    it('leaves an assistant message quoting a marker alone', () => {
        const messages = [{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: appendVoiceMarker('Ship it', marker) }] } as unknown as UIMessage]
        expect(withoutVoiceMarkers(messages)).toBe(messages)
    })
})
