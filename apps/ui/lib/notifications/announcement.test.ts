import { describe, expect, it } from 'vitest'
import { ANNOUNCED_STATUS, advance, isLoud } from './announcement'

describe('ANNOUNCED_STATUS', () => {
    it('announces every kind that lands in the hub', () => {
        expect(ANNOUNCED_STATUS.question).toBe('awaiting_question')
        expect(ANNOUNCED_STATUS.approval).toBe('awaiting_approval')
        expect(ANNOUNCED_STATUS.connector).toBe('awaiting_connector')
        expect(ANNOUNCED_STATUS.info).toBe('awaiting_ack')
        expect(ANNOUNCED_STATUS.error).toBe('error')
    })

    it('leaves a finished run out', () => {
        expect(ANNOUNCED_STATUS.done).toBeUndefined()
    })
})

describe('isLoud', () => {
    it('lets your own run finishing go by on its own', () => {
        expect(isLoud('done')).toBe(false)
    })

    it('keeps a heads-up quiet and everything that blocks the agent loud', () => {
        expect(isLoud('awaiting_ack')).toBe(false)
        expect(isLoud('awaiting_question')).toBe(true)
        expect(isLoud('awaiting_approval')).toBe(true)
        expect(isLoud('awaiting_connector')).toBe(true)
        expect(isLoud('error')).toBe(true)
    })
})

describe('advance', () => {
    it('goes back to rest once the only arrival has been shown', () => {
        expect(advance({ cursor: 0, bundled: 1 }, 1)).toEqual({ cursor: 1, bundled: 1 })
    })

    it('plays a single follower on its own', () => {
        expect(advance({ cursor: 0, bundled: 1 }, 2)).toEqual({ cursor: 1, bundled: 1 })
    })

    it('bundles a burst of three: the first alone, the next two together', () => {
        const afterFirst = advance({ cursor: 0, bundled: 1 }, 3)
        expect(afterFirst).toEqual({ cursor: 2, bundled: 2 })
        expect(advance(afterFirst, 3)).toEqual({ cursor: 3, bundled: 1 })
    })

    it('does not skip the next arrival when nothing is on show', () => {
        expect(advance({ cursor: 2, bundled: 1 }, 2)).toEqual({ cursor: 2, bundled: 1 })
    })
})
