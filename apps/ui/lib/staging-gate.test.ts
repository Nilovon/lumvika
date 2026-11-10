import { describe, expect, it } from 'vitest'
import { stagingGateVerdict } from './staging-gate'

const PASSWORD = 'pâss:word'

function basic(user: string, password: string): string {
    return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`
}

describe('stagingGateVerdict', () => {
    it('has no gate when no password is configured', () => {
        expect(stagingGateVerdict({ password: undefined, authorization: null, pathname: '/board' })).toBe('open')
        expect(stagingGateVerdict({ password: '', authorization: basic('me', ''), pathname: '/board' })).toBe('open')
    })

    it('denies a page without credentials', () => {
        expect(stagingGateVerdict({ password: PASSWORD, authorization: null, pathname: '/' })).toBe('deny')
    })

    it('denies a wrong password, a bearer token and a malformed header', () => {
        expect(stagingGateVerdict({ password: PASSWORD, authorization: basic('me', 'guess'), pathname: '/board' })).toBe('deny')
        expect(stagingGateVerdict({ password: PASSWORD, authorization: `Bearer ${PASSWORD}`, pathname: '/board' })).toBe('deny')
        expect(stagingGateVerdict({ password: PASSWORD, authorization: 'Basic %%%', pathname: '/board' })).toBe('deny')
        expect(stagingGateVerdict({ password: PASSWORD, authorization: `Basic ${btoa('no-separator')}`, pathname: '/board' })).toBe('deny')
    })

    it('opens with the right password under any username, colons and accents included', () => {
        expect(stagingGateVerdict({ password: PASSWORD, authorization: basic('me', PASSWORD), pathname: '/board' })).toBe('open')
        expect(stagingGateVerdict({ password: PASSWORD, authorization: basic('', PASSWORD), pathname: '/board' })).toBe('open')
    })

    it('never closes the API nor the analytics relay', () => {
        expect(stagingGateVerdict({ password: PASSWORD, authorization: null, pathname: '/api/stripe/webhook' })).toBe('open')
        expect(stagingGateVerdict({ password: PASSWORD, authorization: null, pathname: '/ingest/e' })).toBe('open')
    })

    it('still closes a page whose name only starts like an open prefix', () => {
        expect(stagingGateVerdict({ password: PASSWORD, authorization: null, pathname: '/apiary' })).toBe('deny')
    })
})
