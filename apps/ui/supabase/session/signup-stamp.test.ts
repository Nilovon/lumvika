import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { awaitSignupStamp, SIGNUP_STAMP_RETRY_DELAYS_MS } from './signup-stamp'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const STAMP = '2026-10-15T03:57:10.280Z'

describe('awaitSignupStamp', () => {
    it('reads at 2 s, 5 s and 10 s, and stops at the first stamp', async () => {
        const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(STAMP)
        const outcome = awaitSignupStamp(read, new AbortController().signal)

        await vi.advanceTimersByTimeAsync(1_999)
        expect(read).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(read).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(3_000)
        expect(read).toHaveBeenCalledTimes(2)
        await vi.advanceTimersByTimeAsync(5_000)
        expect(read).toHaveBeenCalledTimes(3)

        expect(await outcome).toBe(STAMP)
        await vi.advanceTimersByTimeAsync(60_000)
        expect(read).toHaveBeenCalledTimes(3)
    })

    it('gives up at once when aborted, and reads nothing more', async () => {
        const read = vi.fn().mockResolvedValue(null)
        const controller = new AbortController()
        const outcome = awaitSignupStamp(read, controller.signal)

        await vi.advanceTimersByTimeAsync(2_000)
        expect(read).toHaveBeenCalledTimes(1)
        controller.abort()

        expect(await outcome).toBeNull()
        await vi.advanceTimersByTimeAsync(60_000)
        expect(read).toHaveBeenCalledTimes(1)
    })

    it('drops a stamp that lands after the abort', async () => {
        let settle: (stamp: string) => void = () => {}
        const read = vi.fn(() => new Promise<string>(resolve => (settle = resolve)))
        const controller = new AbortController()
        const outcome = awaitSignupStamp(read, controller.signal)

        await vi.advanceTimersByTimeAsync(2_000)
        controller.abort()
        settle(STAMP)

        expect(await outcome).toBeNull()
    })

    it('runs the whole minute out, then answers with nothing', async () => {
        const read = vi.fn().mockResolvedValue(null)
        const outcome = awaitSignupStamp(read, new AbortController().signal)

        await vi.advanceTimersByTimeAsync(60_000)

        expect(await outcome).toBeNull()
        expect(read).toHaveBeenCalledTimes(SIGNUP_STAMP_RETRY_DELAYS_MS.length)
        expect(SIGNUP_STAMP_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0)).toBe(60_000)
    })

    it('keeps asking after a read that failed', async () => {
        const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(STAMP)
        const outcome = awaitSignupStamp(read, new AbortController().signal)

        await vi.advanceTimersByTimeAsync(5_000)

        expect(await outcome).toBe(STAMP)
        expect(read).toHaveBeenCalledTimes(2)
    })
})
