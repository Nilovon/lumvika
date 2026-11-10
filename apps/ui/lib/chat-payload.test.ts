import { describe, expect, it } from 'vitest'
import type { UIMessage } from 'ai'
import { lastUserText } from './chat-payload'

function userMessage(parts: UIMessage['parts']): UIMessage {
    return { id: 'm1', role: 'user', parts }
}

describe('lastUserText', () => {
    it('concatenates the text parts of the last user message', () => {
        expect(lastUserText([userMessage([{ type: 'text', text: 'Find ' }, { type: 'text', text: 'freelancers' }])])).toBe('Find freelancers')
    })

    it('ignores non-text parts', () => {
        expect(lastUserText([userMessage([{ type: 'file', mediaType: 'image/png', url: 'https://example.com/a.png' }, { type: 'text', text: 'Look at this' }])])).toBe('Look at this')
    })

    it('reads the last message only', () => {
        expect(lastUserText([userMessage([{ type: 'text', text: 'first' }]), { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'answer' }] }, userMessage([{ type: 'text', text: 'second' }])])).toBe('second')
    })

    it('returns nothing when the last message is not the user speaking', () => {
        expect(lastUserText([{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'answer' }] }])).toBe('')
    })

    it('returns nothing on an empty conversation', () => {
        expect(lastUserText([])).toBe('')
    })
})
