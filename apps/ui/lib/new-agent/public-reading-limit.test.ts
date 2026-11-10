import { describe, expect, it } from 'vitest'

import { createReadingLimiter } from './public-reading-limit'

const MINUTE = 60 * 1000

function limiterAt(start: number) {
    const clock = { now: start }
    return { clock, allow: createReadingLimiter(() => clock.now) }
}

function drain(allow: (caller: string) => boolean, caller: string, times: number): number {
    let allowed = 0
    for (let call = 0; call < times; call += 1) if (allow(caller)) allowed += 1
    return allowed
}

describe('createReadingLimiter', () => {
    it('stops one caller at twenty readings and leaves the others alone', () => {
        const { allow } = limiterAt(0)
        expect(drain(allow, 'a', 25)).toBe(20)
        expect(allow('b')).toBe(true)
    })

    it('opens again for a caller once its five minutes are over', () => {
        const { allow, clock } = limiterAt(0)
        drain(allow, 'a', 20)
        clock.now = 4 * MINUTE
        expect(allow('a')).toBe(false)
        clock.now = 5 * MINUTE
        expect(allow('a')).toBe(true)
    })

    it('stops everybody at six hundred readings an hour, however many callers they come from', () => {
        const { allow, clock } = limiterAt(0)
        let allowed = 0
        for (let caller = 0; caller < 700; caller += 1) if (allow(`caller-${caller}`)) allowed += 1
        expect(allowed).toBe(600)
        clock.now = 60 * MINUTE
        expect(allow('late')).toBe(true)
    })
})
