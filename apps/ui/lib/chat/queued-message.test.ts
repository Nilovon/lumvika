import { describe, expect, it } from 'vitest'
import { appendAttachmentsRef, buildAttachmentsRef } from './attachments-marker'
import { parseQueued, queuedPreview, shouldFlush, shouldKeepQueued, type QueuedMessage } from './queued-message'

const queued: QueuedMessage = { id: 'q1', text: 'Ship it', createdAt: 1_757_000_000_000, behindRunId: 'run-1' }

describe('parseQueued', () => {
    it('round-trips what the hook stored', () => {
        expect(parseQueued(JSON.stringify(queued))).toEqual(queued)
    })

    it('accepts a message queued without a known run', () => {
        expect(parseQueued(JSON.stringify({ ...queued, behindRunId: null }))?.behindRunId).toBeNull()
    })

    it.each([
        ['nothing stored', null],
        ['broken json', '{'],
        ['an empty object', '{}'],
        ['an array', '[]'],
        ['a blank text', JSON.stringify({ ...queued, text: '   ' })],
        ['a missing id', JSON.stringify({ ...queued, id: '' })],
        ['a createdAt that is not a number', JSON.stringify({ ...queued, createdAt: 'now' })],
        ['a behindRunId that is not a string', JSON.stringify({ ...queued, behindRunId: 3 })],
    ])('returns null on %s', (_label, raw) => {
        expect(parseQueued(raw)).toBeNull()
    })
})

describe('queuedPreview', () => {
    it('reads a plain message as is', () => {
        expect(queuedPreview('Ship it')).toEqual({ text: 'Ship it', attachments: [] })
    })

    it('drops the attachments marker and un-prefixes the file names', () => {
        const text = appendAttachmentsRef('Look at this', buildAttachmentsRef(['chat-uploads/mtr4k52x-lBg1lF-shot.png']))
        expect(queuedPreview(text)).toEqual({ text: 'Look at this', attachments: ['shot.png'] })
    })

    it('survives a message that is only attachments', () => {
        const text = appendAttachmentsRef('', buildAttachmentsRef(['chat-uploads/mtr4k52x-lBg1lF-report.pdf']))
        expect(queuedPreview(text)).toEqual({ text: '', attachments: ['report.pdf'] })
    })

    it('drops a voice marker', () => {
        expect(queuedPreview('Said out loud\n\n<voice src="a.webm" ms="1200" peaks="AAA">').text).toBe('Said out loud')
    })
})

describe('shouldKeepQueued', () => {
    it('keeps it while the same run is still holding the conversation', () => {
        expect(shouldKeepQueued(queued, 'run-1')).toBe(true)
    })

    it('lets it go once another run holds the conversation', () => {
        expect(shouldKeepQueued(queued, 'run-2')).toBe(false)
    })

    it('lets it go when nothing is running', () => {
        expect(shouldKeepQueued(queued, null)).toBe(false)
    })

    it('lets go a message queued without a known run', () => {
        expect(shouldKeepQueued({ ...queued, behindRunId: null }, null)).toBe(false)
    })
})

describe('shouldFlush', () => {
    const free = { queued, busy: false, uploading: false, status: 'ready', hasError: false }

    it('sends once the conversation is free', () => {
        expect(shouldFlush(free)).toBe(true)
    })

    it.each([
        ['nothing is queued', { queued: null }],
        ['a run still holds the conversation', { busy: true }],
        ['an attachment is still uploading', { uploading: true }],
        ['this tab is streaming', { status: 'streaming' }],
        ['this tab just submitted', { status: 'submitted' }],
        ['the run ended on an error', { hasError: true }],
    ])('waits while %s', (_label, override) => {
        expect(shouldFlush({ ...free, ...override })).toBe(false)
    })
})
