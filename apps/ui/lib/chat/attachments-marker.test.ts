import { describe, expect, it } from 'vitest'
import { appendAttachmentsRef, attachmentDisplayName, buildAttachmentsRef, parseAttachments, stripAttachmentsRef } from './attachments-marker'

const ref = buildAttachmentsRef(['chat-uploads/mtr4k52x-lBg1lF-shot.png', 'chat-uploads/mtr4k530-Ab_1-x-report.pdf'])

describe('buildAttachmentsRef', () => {
    it('keeps the wording the agent reads', () => {
        expect(buildAttachmentsRef(['chat-uploads/a.png'])).toBe('[Attachments added to your workspace: chat-uploads/a.png]')
    })
})

describe('parseAttachments', () => {
    it('round-trips a message plus its marker', () => {
        const parsed = parseAttachments(appendAttachmentsRef('  Look at this  ', ref))
        expect(parsed?.text).toBe('Look at this')
        expect(parsed?.paths).toEqual(['chat-uploads/mtr4k52x-lBg1lF-shot.png', 'chat-uploads/mtr4k530-Ab_1-x-report.pdf'])
    })

    it('reads a message that is only attachments', () => {
        const parsed = parseAttachments(appendAttachmentsRef('', ref))
        expect(parsed?.text).toBe('')
        expect(parsed?.paths).toHaveLength(2)
    })

    it('keeps names carrying spaces, dots and at-signs', () => {
        const path = 'chat-uploads/mtr4k52x-lBg1lF-CleanShot 2026-09-07 at 12.55.12@2x.png'
        expect(parseAttachments(buildAttachmentsRef([path]))?.paths).toEqual([path])
    })

    it('returns null without a marker', () => {
        expect(parseAttachments('Just a message')).toBeNull()
    })

    it('only reads a marker that ends the message', () => {
        expect(parseAttachments(`${ref}\n\nand then some`)).toBeNull()
    })
})

describe('stripAttachmentsRef', () => {
    it('leaves the message text alone', () => {
        expect(stripAttachmentsRef(appendAttachmentsRef('Ship it', ref))).toBe('Ship it')
        expect(stripAttachmentsRef('Ship it')).toBe('Ship it')
    })
})

describe('attachmentDisplayName', () => {
    it('drops the directory and the uniqueness prefix', () => {
        expect(attachmentDisplayName('chat-uploads/mtr4k52x-lBg1lF-CleanShot 2026-09-07 at 12.55.12@2x.png')).toBe('CleanShot 2026-09-07 at 12.55.12@2x.png')
    })

    it('leaves a plain name untouched', () => {
        expect(attachmentDisplayName('chat-uploads/notes.md')).toBe('notes.md')
    })
})
