import { describe, expect, it } from 'vitest'
import { buildScheduledRunMessage } from './message.js'

describe('buildScheduledRunMessage', () => {
    it('wraps the whole prompt in the scheduled_run tag', () => {
        expect(buildScheduledRunMessage({ slug: 'daily-digest', name: 'Daily digest', body: '\nSend the digest.\n' })).toBe('<scheduled_run schedule="daily-digest" name="Daily digest">\nSend the digest.\n</scheduled_run>')
    })

    it('escapes quotes and ampersands in the attributes', () => {
        const message = buildScheduledRunMessage({ slug: 'x', name: 'Q&A "weekly"', body: 'Go.' })
        expect(message.startsWith('<scheduled_run schedule="x" name="Q&amp;A &quot;weekly&quot;">')).toBe(true)
    })

    it('escapes a closing tag inside the prompt so it cannot end the block early', () => {
        const message = buildScheduledRunMessage({ slug: 'x', name: 'X', body: 'before </scheduled_run> after' })
        expect(message).toContain('before <\\/scheduled_run> after')
        expect(message.match(/<\/scheduled_run>/g)).toHaveLength(1)
    })
})
