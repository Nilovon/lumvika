import { describe, expect, it } from 'vitest'
import { withKeyedLock } from './lock.js'

function deferred<T = void>() {
    let resolve!: (value: T) => void
    let reject!: (err: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

const flush = () => new Promise(resolve => setImmediate(resolve))

describe('withKeyedLock', () => {
    it('runs sections on the same key one after the other', async () => {
        const events: string[] = []
        const gate = deferred()
        const first = withKeyedLock('same', async () => {
            events.push('first:start')
            await gate.promise
            events.push('first:end')
        })
        const second = withKeyedLock('same', async () => {
            events.push('second:start')
        })
        await flush()
        expect(events).toEqual(['first:start'])
        gate.resolve()
        await Promise.all([first, second])
        expect(events).toEqual(['first:start', 'first:end', 'second:start'])
    })

    it('runs sections on different keys concurrently', async () => {
        const events: string[] = []
        const gate = deferred()
        const slow = withKeyedLock('key-a', async () => {
            events.push('a:start')
            await gate.promise
            events.push('a:end')
        })
        const fast = withKeyedLock('key-b', async () => {
            events.push('b:done')
        })
        await fast
        expect(events).toEqual(['a:start', 'b:done'])
        gate.resolve()
        await slow
    })

    it('passes the return value through', async () => {
        await expect(withKeyedLock('value', async () => 42)).resolves.toBe(42)
    })

    it('rejects the caller of a failing section without blocking the next one', async () => {
        const failing = withKeyedLock('fail', async () => {
            throw new Error('boom')
        })
        const next = withKeyedLock('fail', async () => 'ran')
        await expect(failing).rejects.toThrow('boom')
        await expect(next).resolves.toBe('ran')
    })

    it('starts a later section only after an earlier failure settles', async () => {
        const events: string[] = []
        const gate = deferred()
        const failing = withKeyedLock('fail-order', async () => {
            await gate.promise
            events.push('failing:end')
            throw new Error('late boom')
        })
        const next = withKeyedLock('fail-order', async () => {
            events.push('next:start')
        })
        await flush()
        expect(events).toEqual([])
        gate.resolve()
        await expect(failing).rejects.toThrow('late boom')
        await next
        expect(events).toEqual(['failing:end', 'next:start'])
    })

    it('keeps serializing a key after its chain has drained', async () => {
        await withKeyedLock('drain', async () => {})
        await flush()
        const events: string[] = []
        const gate = deferred()
        const first = withKeyedLock('drain', async () => {
            await gate.promise
            events.push('first')
        })
        const second = withKeyedLock('drain', async () => {
            events.push('second')
        })
        gate.resolve()
        await Promise.all([first, second])
        expect(events).toEqual(['first', 'second'])
    })
})
