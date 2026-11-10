import { describe, expect, it } from 'vitest'

import { shouldPushToTalk } from './push-to-talk'

const space = { code: 'Space', repeat: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false }
const board = { focusHeld: false, overlayOpen: false }

describe('shouldPushToTalk', () => {
    it('takes Space pressed on the bare board', () => {
        expect(shouldPushToTalk(space, board)).toBe(true)
    })

    it('leaves every other key alone', () => {
        expect(shouldPushToTalk({ ...space, code: 'Enter' }, board)).toBe(false)
    })

    it('starts once, not at every repeat of a held key', () => {
        expect(shouldPushToTalk({ ...space, repeat: true }, board)).toBe(false)
    })

    it('leaves a shortcut alone', () => {
        for (const modifier of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const) expect(shouldPushToTalk({ ...space, [modifier]: true }, board)).toBe(false)
    })

    it('leaves a composition alone', () => {
        expect(shouldPushToTalk({ ...space, isComposing: true }, board)).toBe(false)
    })

    it('leaves Space to whatever holds the focus', () => {
        expect(shouldPushToTalk(space, { ...board, focusHeld: true })).toBe(false)
    })

    it('stays out of the way of a dialog or a menu', () => {
        expect(shouldPushToTalk(space, { ...board, overlayOpen: true })).toBe(false)
    })
})
