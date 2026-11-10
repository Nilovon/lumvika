import { describe, expect, it } from 'vitest'

import { INTAKE_QUOTA, takeIntakeCall } from './anonymous-intake-quota'

describe('takeIntakeCall', () => {
    it('stops a visitor at the quota of each call, independently', () => {
        const workspaceId = 9_000_001
        for (let i = 0; i < INTAKE_QUOTA.explore; i += 1) expect(takeIntakeCall(workspaceId, 'explore')).toBe(true)
        expect(takeIntakeCall(workspaceId, 'explore')).toBe(false)
        expect(takeIntakeCall(workspaceId, 'decide')).toBe(true)
    })

    it('keeps visitors apart', () => {
        for (let i = 0; i < INTAKE_QUOTA.explore; i += 1) takeIntakeCall(9_000_002, 'explore')
        expect(takeIntakeCall(9_000_003, 'explore')).toBe(true)
    })
})
