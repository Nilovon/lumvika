import { describe, expect, it } from 'vitest'

import { STEWARD_PHASES } from './phase'
import { stewardSurface } from './surface'

describe('stewardSurface', () => {
    it('keeps every step of the onboarding on the hub, machine or not', () => {
        for (const phase of STEWARD_PHASES.filter(phase => phase !== 'companion')) {
            expect(stewardSurface(phase, false)).toBe('onboarding')
            expect(stewardSurface(phase, true)).toBe('onboarding')
        }
    })

    it('hands a workspace past its onboarding to the steward on its engine', () => {
        expect(stewardSurface('companion', true)).toBe('engine')
    })

    it('leaves a workspace past its onboarding with no machine without a steward', () => {
        expect(stewardSurface('companion', false)).toBe('none')
    })
})
