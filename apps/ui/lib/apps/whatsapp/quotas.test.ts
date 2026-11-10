import { describe, expect, it } from 'vitest'
import { quotaClaim, quotaLimits, quotaRefusal } from './quotas'

describe('WhatsApp quotas', () => {
    it('holds new conversations far below messages', () => {
        expect(quotaClaim('new_conversation', new Date('2026-10-19T08:00:00Z'), {})).toEqual({ periods: ['2026-10-19'], maxes: [20] })
        expect(quotaClaim('message', new Date('2026-10-19T08:00:00Z'), {})).toEqual({ periods: ['2026-10-19'], maxes: [100] })
    })

    it('reads an override from its own env prefix', () => {
        expect(quotaLimits('new_conversation', { WHATSAPP_QUOTA_NEW_CONVERSATION_DAY: '30' })).toEqual([{ window: 'day', max: 30 }])
        expect(quotaLimits('new_conversation', { LINKEDIN_QUOTA_NEW_CONVERSATION_DAY: '30' })).toEqual([{ window: 'day', max: 20 }])
    })

    it('tells the coworker to stop for the day', () => {
        expect(quotaRefusal('new_conversation', {})).toContain('new conversation limit of this WhatsApp number is reached (20 per day)')
    })
})
