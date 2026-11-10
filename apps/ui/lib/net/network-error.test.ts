import { describe, expect, it } from 'vitest'
import { describeSignInError, isNetworkFailure } from './network-error'

const named = (name: string) => Object.assign(new Error(name), { name })

describe('isNetworkFailure', () => {
    it('recognizes a host that does not answer and a timeout', () => {
        expect(isNetworkFailure(new TypeError('fetch failed'))).toBe(true)
        expect(isNetworkFailure(named('TimeoutError'))).toBe(true)
    })

    it('leaves out a deliberate abort and any other error', () => {
        expect(isNetworkFailure(named('AbortError'))).toBe(false)
        expect(isNetworkFailure(new TypeError('Cannot read properties of undefined'))).toBe(false)
        expect(isNetworkFailure(new Error('fetch failed'))).toBe(false)
        expect(isNetworkFailure('fetch failed')).toBe(false)
    })
})

describe('describeSignInError', () => {
    it('replaces a network failure with a sentence', () => {
        const message = describeSignInError(new TypeError('fetch failed'), 'Failed to start OAuth')
        expect(message).not.toContain('fetch failed')
        expect(message).toMatch(/try again/i)
    })

    it('keeps any other message, and the fallback for a non-error', () => {
        expect(describeSignInError(new Error('this server does not advertise an OAuth authorization server'), 'x')).toBe('this server does not advertise an OAuth authorization server')
        expect(describeSignInError('nope', 'Failed to start OAuth')).toBe('Failed to start OAuth')
    })
})
