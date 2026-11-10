import { describe, expect, it } from 'vitest'
import { withAgentLock } from './lock.js'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('withAgentLock', () => {
    it('serializes read-modify-write on the same id so no update is lost', async () => {
        const shared = { n: 0 }
        await Promise.all(
            Array.from({ length: 50 }, () =>
                withAgentLock('a', async () => {
                    const current = shared.n
                    await tick()
                    shared.n = current + 1
                }),
            ),
        )
        expect(shared.n).toBe(50)
    })

    it('returns the callback result and propagates its rejection without breaking the chain', async () => {
        await expect(withAgentLock('b', async () => 42)).resolves.toBe(42)
        await expect(
            withAgentLock('b', async () => {
                throw new Error('boom')
            }),
        ).rejects.toThrow('boom')
        await expect(withAgentLock('b', async () => 'ok')).resolves.toBe('ok')
    })

    it('runs different ids concurrently', async () => {
        const order: string[] = []
        const slow = withAgentLock('x', async () => {
            await tick()
            await tick()
            order.push('x')
        })
        const fast = withAgentLock('y', async () => {
            order.push('y')
        })
        await Promise.all([slow, fast])
        expect(order[0]).toBe('y')
    })
})
