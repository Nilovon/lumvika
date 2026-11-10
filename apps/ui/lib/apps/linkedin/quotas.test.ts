import { describe, expect, it } from 'vitest'
import { isoWeekKey, quotaClaim, quotaLimits } from './quotas'

describe('isoWeekKey', () => {
    it('numbers weeks from Monday, ISO style', () => {
        expect(isoWeekKey(new Date('2026-10-14T12:00:00Z'))).toBe('2026-W42')
        expect(isoWeekKey(new Date('2026-10-12T00:00:00Z'))).toBe('2026-W42')
        expect(isoWeekKey(new Date('2026-10-11T23:59:59Z'))).toBe('2026-W41')
        expect(isoWeekKey(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53')
    })
})

describe('quotaClaim', () => {
    it('claims an invitation against its day and its week', () => {
        expect(quotaClaim('invitation', new Date('2026-10-14T08:00:00Z'), {})).toEqual({ periods: ['2026-10-14', '2026-W42'], maxes: [25, 150] })
    })

    it('reads an override from the env', () => {
        expect(quotaLimits('message', { LINKEDIN_QUOTA_MESSAGE_DAY: '60' })).toEqual([{ window: 'day', max: 60 }])
        expect(quotaLimits('message', { LINKEDIN_QUOTA_MESSAGE_DAY: 'lots' })).toEqual([{ window: 'day', max: 40 }])
    })
})
