import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-cli-auth-'))
process.env.LUMVIKA_API_KEY = ''

const calls = vi.hoisted(() => [] as [string, unknown][])

vi.mock('./claude-token.js', () => ({
    ensureFreshClaudeToken: async (connection: unknown) => {
        calls.push(['claude', connection])
    },
    acquireClaudeLease: (connection: unknown) => {
        calls.push(['lease', connection])
        return () => calls.push(['release', connection])
    },
}))

vi.mock('./codex-auth.js', () => ({
    ensureCodexAuth: async (connection: unknown) => {
        calls.push(['codex', connection])
    },
}))

const { beforeEach, describe, expect, it } = await import('vitest')
const { ensureCliAuth } = await import('./cli-auth.js')

const connection = { id: 'cnx' } as any

beforeEach(() => {
    calls.length = 0
})

describe('ensureCliAuth', () => {
    it('refreshes the Claude token, then holds it until released', async () => {
        const release = await ensureCliAuth('claude', connection)
        expect(calls).toEqual([
            ['claude', connection],
            ['lease', connection],
        ])
        release()
        expect(calls.at(-1)).toEqual(['release', connection])
    })

    it('materialises the Codex auth for codex', async () => {
        await ensureCliAuth('codex', null)
        expect(calls).toEqual([['codex', null]])
    })

    it('does nothing for a provider that is not a CLI', async () => {
        for (const provider of ['lumvika', 'anthropic', 'openai', 'google', 'openrouter'] as const) await ensureCliAuth(provider, connection)
        expect(calls).toEqual([])
    })
})
