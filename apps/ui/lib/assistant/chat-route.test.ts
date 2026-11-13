import { describe, expect, it } from 'vitest'

import { chatPath, chatRouteOf } from './chat-route'

describe('chatRouteOf', () => {
    it('reads the list, a new chat and a chat from the path', () => {
        expect(chatRouteOf('/chat')).toEqual({ kind: 'index' })
        expect(chatRouteOf('/chat/')).toEqual({ kind: 'index' })
        expect(chatRouteOf(null)).toEqual({ kind: 'index' })
        expect(chatRouteOf('/chat/new')).toEqual({ kind: 'new' })
        expect(chatRouteOf('/chat/4f1c')).toEqual({ kind: 'chat', chatId: '4f1c' })
    })

    it('writes back the path it reads', () => {
        for (const path of ['/chat', '/chat/new', '/chat/4f1c']) expect(chatPath(chatRouteOf(path))).toBe(path)
    })
})
