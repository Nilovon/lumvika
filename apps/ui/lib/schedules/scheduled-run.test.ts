import { describe, expect, it } from 'vitest'
import { parseScheduledRun } from './scheduled-run'

describe('parseScheduledRun', () => {
    it('reads the schedule and its prompt', () => {
        expect(parseScheduledRun('<scheduled_run schedule="daily-digest" name="Daily digest">\nSend the digest.\n\n- Inbox\n- CRM\n</scheduled_run>')).toEqual({
            slug: 'daily-digest',
            name: 'Daily digest',
            prompt: 'Send the digest.\n\n- Inbox\n- CRM',
        })
    })

    it('ignores a plain message, and one that only quotes the tag', () => {
        expect(parseScheduledRun('Send the digest.')).toBeNull()
        expect(parseScheduledRun('What does <scheduled_run schedule="x" name="X">\nGo.\n</scheduled_run> mean?')).toBeNull()
    })

    it('unescapes the attributes and an escaped closing tag in the prompt', () => {
        const parsed = parseScheduledRun('<scheduled_run schedule="x" name="Q&amp;A &quot;weekly&quot;">\nbefore <\\/scheduled_run> after\n</scheduled_run>')
        expect(parsed?.name).toBe('Q&A "weekly"')
        expect(parsed?.prompt).toBe('before </scheduled_run> after')
    })

    it('falls back to the slug when the name is empty', () => {
        expect(parseScheduledRun('<scheduled_run schedule="nightly" name="">\nGo.\n</scheduled_run>')?.name).toBe('nightly')
    })
})
