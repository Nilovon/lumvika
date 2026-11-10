import { describe, expect, it } from 'vitest'

import { callerIp, callerRateKey } from './caller-ip'

describe('callerIp', () => {
    it('reads the address the edge wrote, over the one the caller claims', () => {
        expect(callerIp(new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1, 203.0.113.7' }))).toBe('203.0.113.7')
    })

    it('falls back on the first forwarded address', () => {
        expect(callerIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    })

    it('counts a caller with no address under one name', () => {
        expect(callerIp(new Headers())).toBe('unknown')
    })
})

describe('callerRateKey', () => {
    it('keeps an IPv4 address whole', () => {
        expect(callerRateKey('203.0.113.7')).toBe('203.0.113.7')
    })

    it('counts every address of an IPv6 /64 as one caller', () => {
        expect(callerRateKey('2A01:cb00:1234:5678:aaaa:bbbb:cccc:dddd')).toBe('2a01:cb00:1234:5678::/64')
        expect(callerRateKey('2a01:cb00:1234:5678::1')).toBe('2a01:cb00:1234:5678::/64')
    })

    it('fills the groups an address leaves out', () => {
        expect(callerRateKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    })

    it('reads the IPv4 address carried by a mapped IPv6 one', () => {
        expect(callerRateKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
    })
})
