import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-shell-'))

const { describe, expect, it, vi } = await import('vitest')
const { HostBreaker, BLOCKED_SOURCE_PREFIX } = await import('../host-breaker.js')
const { shellTools } = await import('./shell.js')

type Runner = Parameters<typeof shellTools>[1]

function ctxWith() {
    return { agent: { id: 'shell', env: {}, config: { tools: {} } }, sessionId: 's', logger: { warn: () => {} }, hostBreaker: new HostBreaker() } as any
}

async function exec(ctx: ReturnType<typeof ctxWith>, run: Runner, command: string): Promise<string> {
    return (await (shellTools(ctx, run).shell_exec as any).execute({ command, timeoutMs: 120_000 }, { toolCallId: 'call-1', messages: [] })) as string
}

describe('shell_exec', () => {
    it('closes a host whose curl keeps answering 403 even though curl exits 0', async () => {
        const run = vi.fn(async () => ({ stdout: 'HTTP/2 403 \ncontent-type: text/html\n', stderr: '' }))
        const ctx = ctxWith()
        expect(await exec(ctx, run, 'curl -i https://www.reddit.com/r/startups.json')).toContain('[attempt 1/3 on reddit.com failed in this run]')
        await exec(ctx, run, 'curl -i -A "Mozilla" https://reddit.com/r/startups.json')
        expect(await exec(ctx, run, 'curl -s https://www.reddit.com/r/startups/')).toContain(BLOCKED_SOURCE_PREFIX)
        expect(await exec(ctx, run, 'curl -s https://reddit.com/r/startups/')).toMatch(new RegExp(`^${BLOCKED_SOURCE_PREFIX} reddit.com`))
        expect(run).toHaveBeenCalledTimes(3)
    })

    it('never touches the breaker for a command without a URL', async () => {
        const run = vi.fn(async () => {
            throw Object.assign(new Error('Command failed: ls nowhere'), { stdout: '', stderr: 'ls: nowhere: No such file' })
        })
        const ctx = ctxWith()
        for (let i = 0; i < 5; i++) expect(await exec(ctx, run, 'ls nowhere')).toMatch(/^Command failed: /)
        expect(run).toHaveBeenCalledTimes(5)
    })

    it('says when a command was killed on timeout', async () => {
        const run = vi.fn(async () => {
            throw Object.assign(new Error('Command failed: sleep 999'), { killed: true, signal: 'SIGTERM', stdout: '', stderr: '' })
        })
        expect(await exec(ctxWith(), run, 'sleep 999')).toMatch(/^Command timed out after 120 s and was killed/)
    })

    it('returns the output of a working command', async () => {
        const run = vi.fn(async () => ({ stdout: 'hello\n', stderr: '' }))
        expect(await exec(ctxWith(), run, 'echo hello')).toBe('hello\n')
    })
})
