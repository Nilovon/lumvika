import { describe, expect, it } from 'vitest'

import { arrivalOf } from '@/hooks/useArriveByTop'

describe('arrivalOf', () => {
    it('waits for a real layout when the chat is hidden', () => {
        expect(arrivalOf(0, 0)).toBe('measure-later')
        expect(arrivalOf(480, 0)).toBe('measure-later')
        expect(arrivalOf(0, 600)).toBe('measure-later')
    })

    it('keeps following the bottom when the block fits in the thread', () => {
        expect(arrivalOf(300, 600)).toBe('stick')
        expect(arrivalOf(588, 600)).toBe('stick')
    })

    it('brings a block taller than the thread in by its top', () => {
        expect(arrivalOf(589, 600)).toBe('arrive')
        expect(arrivalOf(1200, 600)).toBe('arrive')
    })
})
