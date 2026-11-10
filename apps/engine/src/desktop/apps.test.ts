import { vi } from 'vitest'

const state = vi.hoisted(() => ({
    openWindows: {} as Record<string, string>,
    activated: [] as string[],
    spawns: [] as Array<{ command: string; args: string[]; cwd: string }>,
    tracked: [] as string[],
    takeovers: [] as Array<{ agentId: string; url: string | undefined; options: unknown }>,
}))

vi.mock('node:child_process', () => ({
    execFile: (_command: string, args: string[], _options: unknown, done: (err: Error | null, stdout: string) => void) => {
        if (args[0] === 'search') return done(null, state.openWindows[args.at(-1)!] ?? '')
        state.activated.push(args[1]!)
        done(null, '')
    },
    spawn: (command: string, args: string[], options: { cwd: string }) => {
        state.spawns.push({ command, args, cwd: options.cwd })
        return { once() {} }
    },
}))

vi.mock('./session.js', () => ({
    ensureDesktop: async () => ({ display: ':42', vncPort: 5942 }),
    desktopEnv: (display: string) => ({ DISPLAY: display }),
    trackDesktopChild: (agentId: string) => state.tracked.push(agentId),
}))

vi.mock('./takeover.js', () => ({
    startTakeover: async (agentId: string, url: string | undefined, options: unknown) => {
        state.takeovers.push({ agentId, url, options })
    },
}))

const { beforeEach, describe, expect, it } = await import('vitest')
const { openDesktopApp } = await import('./apps.js')

beforeEach(() => {
    state.openWindows = {}
    state.activated.length = 0
    state.spawns.length = 0
    state.tracked.length = 0
    state.takeovers.length = 0
})

describe('desktop apps', () => {
    it('opens the files and the terminal in the agent workspace, tied to its screen', async () => {
        await openDesktopApp('a1', 'files')
        await openDesktopApp('a1', 'terminal')
        expect(state.spawns.map(s => s.command)).toEqual(['thunar', 'xfce4-terminal'])
        expect(state.spawns[0]!.args[0]).toMatch(/agents\/a1\/workspace$/)
        expect(state.spawns[1]!.cwd).toMatch(/agents\/a1\/workspace$/)
        expect(state.tracked).toEqual(['a1', 'a1'])
    })

    it('brings an open window forward instead of opening a second one', async () => {
        state.openWindows = { Thunar: '111\n222\n' }
        await openDesktopApp('a1', 'files')
        expect(state.activated).toEqual(['222'])
        expect(state.spawns).toEqual([])
    })

    it('opens the browser through a takeover that ends with its audience, never as a process of its own', async () => {
        await openDesktopApp('a1', 'browser')
        expect(state.takeovers).toEqual([{ agentId: 'a1', url: undefined, options: { endWhenUnwatched: true } }])
        expect(state.spawns).toEqual([])
    })

    it('brings the browser forward when one is already on the screen', async () => {
        state.openWindows = { '[Cc]hrom': '333\n' }
        await openDesktopApp('a1', 'browser')
        expect(state.activated).toEqual(['333'])
        expect(state.takeovers).toEqual([])
    })
})
