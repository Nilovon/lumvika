import { describe, expect, it, vi } from 'vitest'
import { BLOCKED_SOURCE_PREFIX, HOST_FAILURE_THRESHOLD, HostBreaker, hostOf, hostsOf, httpFailureInOutput, isFailureStatus, withHostBreaker } from './host-breaker.js'

describe('HostBreaker', () => {
    it('closes a host after the threshold of consecutive failures and keeps it closed', () => {
        const breaker = new HostBreaker()
        for (let i = 1; i < HOST_FAILURE_THRESHOLD; i++) {
            breaker.record('reddit.com', false)
            expect(breaker.check('reddit.com')).toEqual({ open: true })
        }
        breaker.record('reddit.com', false)
        expect(breaker.check('reddit.com')).toEqual({ open: false, attempts: HOST_FAILURE_THRESHOLD })
        breaker.record('reddit.com', false)
        expect(breaker.check('reddit.com').open).toBe(false)
    })

    it('resets the streak on a success', () => {
        const breaker = new HostBreaker()
        breaker.record('reddit.com', false)
        breaker.record('reddit.com', false)
        expect(breaker.record('reddit.com', true)).toBe(0)
        breaker.record('reddit.com', false)
        expect(breaker.check('reddit.com')).toEqual({ open: true })
    })

    it('names the host in the blocked message', () => {
        expect(new HostBreaker().blockedMessage('reddit.com')).toMatch(new RegExp(`^${BLOCKED_SOURCE_PREFIX} reddit.com refused ${HOST_FAILURE_THRESHOLD}`))
    })
})

describe('hostOf', () => {
    it('lowercases and strips www', () => {
        expect(hostOf('https://WWW.Reddit.com/r/startups.json')).toBe('reddit.com')
        expect(hostOf('http://archive.org/a')).toBe('archive.org')
    })

    it('returns null on garbage', () => {
        expect(hostOf('not a url')).toBeNull()
    })
})

describe('hostsOf', () => {
    it('collects each host once from a shell command', () => {
        expect(hostsOf('curl -s https://www.reddit.com/r/x.json | jq . && wget http://archive.org/a; curl https://reddit.com/y')).toEqual(['reddit.com', 'archive.org'])
    })

    it('finds nothing in a command without URLs', () => {
        expect(hostsOf('ls -la && npm test')).toEqual([])
    })
})

describe('isFailureStatus', () => {
    it.each([
        [200, false],
        [301, false],
        [404, false],
        [401, true],
        [403, true],
        [407, true],
        [429, true],
        [500, true],
        [502, true],
    ])('%s → %s', (status, failed) => {
        expect(isFailureStatus(status)).toBe(failed)
    })
})

describe('httpFailureInOutput', () => {
    it('spots a refused status in curl or wget output', () => {
        expect(httpFailureInOutput('HTTP/2 403 \ncontent-type: text/html')).toBe(true)
        expect(httpFailureInOutput('HTTP/1.1 429 Too Many Requests')).toBe(true)
        expect(httpFailureInOutput('2026-09-29 ERROR 403: Forbidden.')).toBe(true)
    })

    it('ignores a successful response', () => {
        expect(httpFailureInOutput('HTTP/1.1 200 OK\n{"ok":true}')).toBe(false)
        expect(httpFailureInOutput('')).toBe(false)
    })
})

describe('withHostBreaker', () => {
    it('runs without bookkeeping when no host is involved', async () => {
        const breaker = new HostBreaker()
        const attempt = vi.fn(async () => ({ text: 'out', failed: true }))
        expect(await withHostBreaker(breaker, [], attempt)).toBe('out')
        expect(breaker.check('reddit.com')).toEqual({ open: true })
    })

    it('appends the attempt count, then the blocked message, then stops calling the tool', async () => {
        const breaker = new HostBreaker()
        const attempt = vi.fn(async () => ({ text: '[403] https://reddit.com/x', failed: true }))
        expect(await withHostBreaker(breaker, ['reddit.com'], attempt)).toBe(`[403] https://reddit.com/x\n\n[attempt 1/${HOST_FAILURE_THRESHOLD} on reddit.com failed in this run]`)
        await withHostBreaker(breaker, ['reddit.com'], attempt)
        const third = await withHostBreaker(breaker, ['reddit.com'], attempt)
        expect(third).toContain('[403] https://reddit.com/x')
        expect(third).toContain(BLOCKED_SOURCE_PREFIX)
        const fourth = await withHostBreaker(breaker, ['reddit.com'], attempt)
        expect(fourth.startsWith(BLOCKED_SOURCE_PREFIX)).toBe(true)
        expect(attempt).toHaveBeenCalledTimes(HOST_FAILURE_THRESHOLD)
    })

    it('leaves a successful result untouched', async () => {
        const breaker = new HostBreaker()
        breaker.record('reddit.com', false)
        expect(await withHostBreaker(breaker, ['reddit.com'], async () => ({ text: 'fine', failed: false }))).toBe('fine')
        expect(breaker.check('reddit.com')).toEqual({ open: true })
    })
})
