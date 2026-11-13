import { describe, expect, it } from 'vitest'

import { parseStewardFolds } from './steward-fold'

describe('parseStewardFolds', () => {
    it('reads the two values the cookie is written with', () => {
        expect(parseStewardFolds('fold')).toBe(true)
        expect(parseStewardFolds('dock')).toBe(false)
    })

    it('knows nothing from a missing or foreign value', () => {
        expect(parseStewardFolds(undefined)).toBeNull()
        expect(parseStewardFolds(null)).toBeNull()
        expect(parseStewardFolds('')).toBeNull()
        expect(parseStewardFolds('true')).toBeNull()
    })
})
