import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { vi } from 'vitest'

type FakeXvfb = EventEmitter & { stdio: unknown[]; kill: () => void; unref: () => void; killed: boolean }

const xvfb = vi.hoisted(() => ({ spawns: [] as Array<{ command: string; args: string[] }>, children: [] as unknown[], next: null as ((child: never) => void) | null }))

vi.mock('node:child_process', () => ({
    spawn: (command: string, args: string[]) => {
        xvfb.spawns.push({ command, args })
        const child = Object.assign(new EventEmitter(), { stdio: [null, null, null, new PassThrough()], killed: false, unref: () => {} }) as FakeXvfb
        child.kill = () => {
            child.killed = true
        }
        xvfb.children.push(child)
        queueMicrotask(() => xvfb.next?.(child as never))
        return child
    },
}))

const { afterEach, beforeEach, describe, expect, it } = await import('vitest')

async function freshModule() {
    vi.resetModules()
    return import('./virtual-display.js')
}

function announce(child: FakeXvfb, display: number) {
    ;(child.stdio[3] as PassThrough).write(`${display}\n`)
}

beforeEach(() => {
    xvfb.spawns.length = 0
    xvfb.children.length = 0
    xvfb.next = child => announce(child, 42)
    vi.stubEnv('DISPLAY', '')
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

describe('holdDisplay', () => {
    it('uses the display the engine already has, for every agent', async () => {
        vi.stubEnv('DISPLAY', ':0')
        const { holdDisplay } = await freshModule()
        expect((await holdDisplay('a1')).display).toBe(':0')
        expect((await holdDisplay('a2')).display).toBe(':0')
        expect(xvfb.spawns).toEqual([])
    })

    it('starts no Xvfb outside Linux', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
        const { holdDisplay } = await freshModule()
        expect((await holdDisplay('a1')).display).toBeNull()
        expect(xvfb.spawns).toEqual([])
    })

    it('starts one Xvfb per agent, reads the display it picked, and reuses it for that agent', async () => {
        const { holdDisplay } = await freshModule()
        expect((await holdDisplay('a1')).display).toBe(':42')
        expect((await holdDisplay('a1')).display).toBe(':42')
        expect(xvfb.spawns).toEqual([{ command: 'Xvfb', args: ['-displayfd', '3', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'] }])
    })

    it('gives two agents two displays', async () => {
        const { holdDisplay } = await freshModule()
        expect((await holdDisplay('a1')).display).toBe(':42')
        xvfb.next = child => announce(child, 43)
        expect((await holdDisplay('a2')).display).toBe(':43')
        expect(xvfb.spawns).toHaveLength(2)
    })

    it('resolves to no display when Xvfb is not installed', async () => {
        xvfb.next = child => child.emit('error', Object.assign(new Error('spawn Xvfb ENOENT'), { code: 'ENOENT' }))
        const { holdDisplay } = await freshModule()
        expect((await holdDisplay('a1')).display).toBeNull()
    })

    it('starts a new Xvfb once the previous one died', async () => {
        const { holdDisplay } = await freshModule()
        expect((await holdDisplay('a1')).display).toBe(':42')
        ;(xvfb.children[0] as FakeXvfb).emit('exit', 1)
        xvfb.next = child => announce(child, 43)
        expect((await holdDisplay('a1')).display).toBe(':43')
        expect(xvfb.spawns).toHaveLength(2)
    })

    it('stops the Xvfb of an agent a minute after its last hold was released, and leaves the others up', async () => {
        vi.useFakeTimers()
        const { holdDisplay } = await freshModule()
        const first = await holdDisplay('a1')
        const second = await holdDisplay('a1')
        xvfb.next = child => announce(child, 43)
        await holdDisplay('a2')
        const [own, other] = xvfb.children as FakeXvfb[]

        first.release()
        first.release()
        await vi.advanceTimersByTimeAsync(5 * 60_000)
        expect(own!.killed).toBe(false)

        second.release()
        await vi.advanceTimersByTimeAsync(59_000)
        expect(own!.killed).toBe(false)
        await vi.advanceTimersByTimeAsync(1_000)
        expect(own!.killed).toBe(true)
        expect(other!.killed).toBe(false)
    })

    it('keeps the Xvfb when it is held again before the minute is over', async () => {
        vi.useFakeTimers()
        const { holdDisplay } = await freshModule()
        ;(await holdDisplay('a1')).release()
        await vi.advanceTimersByTimeAsync(30_000)
        await holdDisplay('a1')
        await vi.advanceTimersByTimeAsync(5 * 60_000)
        expect((xvfb.children[0] as FakeXvfb).killed).toBe(false)
        expect(xvfb.spawns).toHaveLength(1)
    })

    it('gives up and kills an Xvfb that never announces its display', async () => {
        vi.useFakeTimers()
        xvfb.next = null
        const { holdDisplay } = await freshModule()
        const pending = holdDisplay('a1')
        await vi.advanceTimersByTimeAsync(5_000)
        const child = xvfb.children[0] as FakeXvfb
        expect(child.killed).toBe(true)
        child.emit('exit', null)
        expect((await pending).display).toBeNull()
    })
})
