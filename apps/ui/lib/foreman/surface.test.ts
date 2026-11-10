import { describe, expect, it } from 'vitest'

import { FOREMAN_PHASES } from './phase'
import { foremanSurface } from './surface'

describe('foremanSurface', () => {
    it('keeps every step of the onboarding on the hub, machine or not', () => {
        for (const phase of FOREMAN_PHASES.filter(phase => phase !== 'companion')) {
            expect(foremanSurface(phase, false)).toBe('onboarding')
            expect(foremanSurface(phase, true)).toBe('onboarding')
        }
    })

    it('hands a workspace past its onboarding to the foreman on its engine', () => {
        expect(foremanSurface('companion', true)).toBe('engine')
    })

    it('leaves a workspace past its onboarding with no machine without a foreman', () => {
        expect(foremanSurface('companion', false)).toBe('none')
    })
})
