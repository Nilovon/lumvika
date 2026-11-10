import { describe, expect, it } from 'vitest'

import { reachableChannels } from './reach'

describe('reachableChannels', () => {
    it('keeps both channels, WhatsApp first, where nothing is refused', () => {
        expect(reachableChannels('FR', 'verify')).toEqual(['whatsapp', 'sms'])
        expect(reachableChannels('FR', 'lumvika')).toEqual(['whatsapp', 'sms'])
    })

    it('drops WhatsApp for codes where Bird Verify cannot carry them, not for Lumvika’s own number', () => {
        expect(reachableChannels('IN', 'verify')).toEqual(['sms'])
        expect(reachableChannels('IN', 'lumvika')).toEqual(['whatsapp', 'sms'])
    })

    it('drops WhatsApp for Lumvika’s own number where Meta keeps it out, not for codes', () => {
        expect(reachableChannels('BR', 'lumvika')).toEqual(['sms'])
        expect(reachableChannels('BR', 'lumvika_marketing')).toEqual(['sms'])
        expect(reachableChannels('BR', 'verify')).toEqual(['whatsapp', 'sms'])
    })

    it('drops WhatsApp for a marketing template to the US, not for a utility one nor for Canada', () => {
        expect(reachableChannels('US', 'lumvika_marketing')).toEqual(['sms'])
        expect(reachableChannels('US', 'lumvika')).toEqual(['whatsapp', 'sms'])
        expect(reachableChannels('CA', 'lumvika_marketing')).toEqual(['whatsapp', 'sms'])
    })

    it('leaves China no channel at all', () => {
        expect(reachableChannels('CN', 'verify')).toEqual([])
        expect(reachableChannels('CN', 'lumvika')).toEqual([])
    })

    it('keeps both channels when the country is unknown', () => {
        expect(reachableChannels(undefined, 'verify')).toEqual(['whatsapp', 'sms'])
    })
})
