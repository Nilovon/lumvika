import { vi } from 'vitest'

const calls = vi.hoisted(() => [] as [string, string[], unknown][])

vi.mock('node:child_process', () => ({
    execFileSync: (file: string, args: string[], options: unknown) => {
        calls.push([file, args, options])
    },
}))

const { afterEach, beforeEach, describe, expect, it } = await import('vitest')
const { serviceCommand } = await import('./service.js')

beforeEach(() => {
    calls.length = 0
    vi.stubEnv('LUMVIKA_SERVICE', undefined)
    vi.spyOn(process, 'getuid').mockReturnValue(1000)
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
})

describe('serviceCommand', () => {
    it('drives systemctl through sudo when not root', () => {
        serviceCommand('restart', [])
        expect(calls).toEqual([['sudo', ['systemctl', 'restart', 'lumvika'], { stdio: 'inherit' }]])
    })

    it('drives systemctl directly as root', () => {
        vi.spyOn(process, 'getuid').mockReturnValue(0)
        serviceCommand('status', [])
        expect(calls).toEqual([['systemctl', ['status', 'lumvika'], { stdio: 'inherit' }]])
    })

    it('tails the logs, following them unless told not to', () => {
        serviceCommand('logs', [])
        serviceCommand('logs', ['--no-follow'])
        expect(calls.map(([file, args]) => [file, ...args].join(' '))).toEqual(['sudo journalctl -u lumvika -n 200 -f', 'sudo journalctl -u lumvika -n 200'])
    })

    it('targets the service named by LUMVIKA_SERVICE', () => {
        vi.stubEnv('LUMVIKA_SERVICE', 'lumvika-staging')
        serviceCommand('stop', [])
        serviceCommand('logs', ['--no-follow'])
        expect(calls.map(([file, args]) => [file, ...args].join(' '))).toEqual(['sudo systemctl stop lumvika-staging', 'sudo journalctl -u lumvika-staging -n 200'])
    })
})
