import { activePageIndex, conversationPages } from '@/components/chat/conversation-pages'

describe('conversation pages', () => {
    it('follows the header tabs and ends on the draft', () => {
        expect(conversationPages(['a', 'b'], {}, 'new-1')).toEqual([
            { key: 'a', sessionId: 'a' },
            { key: 'b', sessionId: 'b' },
            { key: 'new-1', sessionId: null },
        ])
    })

    it('keeps the draft key on a conversation born from it', () => {
        expect(conversationPages(['a', 'c'], { c: 'new-1' }, 'new-2')).toEqual([
            { key: 'a', sessionId: 'a' },
            { key: 'new-1', sessionId: 'c' },
            { key: 'new-2', sessionId: null },
        ])
    })

    it('opens on the active conversation, or the draft', () => {
        const pages = conversationPages(['a', 'b'], {}, 'new-1')
        expect(activePageIndex(pages, 'b')).toBe(1)
        expect(activePageIndex(pages, null)).toBe(2)
        expect(activePageIndex(pages, 'gone')).toBe(2)
    })
})
