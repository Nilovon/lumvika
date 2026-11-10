import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-reconcile-'))
process.env.RERUN_API_KEY = ''

const { store, structured, warnings } = vi.hoisted(() => ({
    store: {
        recallMemory: vi.fn(),
        writeMemory: vi.fn(),
        updateMemory: vi.fn(),
    },
    structured: { generateStructured: vi.fn() },
    warnings: [] as unknown[][],
}))

vi.mock('./store.js', () => store)
vi.mock('../agents/structured.js', () => structured)
vi.mock('../agents/providers.js', () => ({ modelFor: () => 'mock-model' }))
vi.mock('../connections/cli-auth.js', () => ({ ensureCliAuth: async () => () => {} }))
vi.mock('../lib/logger.js', () => ({
    logger: { warn: (...args: unknown[]) => warnings.push(args), info() {}, error() {}, debug() {} },
}))

const { beforeEach, describe, expect, it } = await import('vitest')
const { reconcileWrite } = await import('./reconcile.js')

import type { LoadedAgent } from '../agents/types.js'

const agent = { id: 'reconcile-agent', resolved: { provider: 'claude', model: 'claude-opus-5-5', connection: null } } as unknown as LoadedAgent

const candidate = (id: string, content: string) => ({ id, content, kind: 'fact', tags: [], createdAt: '2026-01-01T00:00:00.000Z', strength: 1 })

beforeEach(() => {
    store.recallMemory.mockReset()
    store.writeMemory.mockReset().mockResolvedValue('new-id')
    store.updateMemory.mockReset().mockResolvedValue(undefined)
    structured.generateStructured.mockReset()
    warnings.length = 0
})

describe('reconcileWrite', () => {
    it('recalls up to 5 candidates without reinforcing and including dormant ones', async () => {
        store.recallMemory.mockResolvedValue([])
        await reconcileWrite(agent, 'the office is in paris', 'fact', [])
        expect(store.recallMemory).toHaveBeenCalledWith(agent, 'the office is in paris', 5, { reinforce: 'none', includeDormant: true })
    })

    it('returns the existing id on an exact trimmed match without calling the model or writing', async () => {
        store.recallMemory.mockResolvedValue([candidate('m1', '  the office is in paris \n')])
        const result = await reconcileWrite(agent, 'the office is in paris  ', 'fact', [])
        expect(result).toEqual({ id: 'm1', updated: false })
        expect(structured.generateStructured).not.toHaveBeenCalled()
        expect(store.writeMemory).not.toHaveBeenCalled()
        expect(store.updateMemory).not.toHaveBeenCalled()
    })

    it('writes a new memory when there are no candidates', async () => {
        store.recallMemory.mockResolvedValue([])
        const result = await reconcileWrite(agent, 'the office is in paris', 'fact', ['office'])
        expect(result).toEqual({ id: 'new-id', updated: false })
        expect(store.writeMemory).toHaveBeenCalledWith(agent, 'the office is in paris', 'fact', ['office'])
        expect(structured.generateStructured).not.toHaveBeenCalled()
    })

    it('treats a failing recall as no candidates', async () => {
        store.recallMemory.mockRejectedValue(new Error('db locked'))
        const result = await reconcileWrite(agent, 'the office is in paris', 'fact', [])
        expect(result).toEqual({ id: 'new-id', updated: false })
        expect(structured.generateStructured).not.toHaveBeenCalled()
    })

    it('updates the memory the model points at', async () => {
        store.recallMemory.mockResolvedValue([candidate('m1', 'the office is in lyon'), candidate('m2', 'the ceo is alice')])
        structured.generateStructured.mockResolvedValue({ updateId: 'm1' })
        const result = await reconcileWrite(agent, 'the office moved to paris', 'fact', [])
        expect(result).toEqual({ id: 'm1', updated: true })
        expect(store.updateMemory).toHaveBeenCalledWith(agent, 'm1', 'the office moved to paris')
        expect(store.writeMemory).not.toHaveBeenCalled()
    })

    it('lists every candidate in the prompt and passes the resolved model and an abort signal', async () => {
        store.recallMemory.mockResolvedValue([candidate('m1', 'the office is in lyon'), candidate('m2', 'the ceo is alice')])
        structured.generateStructured.mockResolvedValue({ updateId: null })
        await reconcileWrite(agent, 'the office moved to paris', 'fact', [])
        const input = structured.generateStructured.mock.calls[0][0]
        expect(input.model).toBe('mock-model')
        expect(input.prompt).toContain('"the office moved to paris"')
        expect(input.prompt).toContain('- [m1] (fact) the office is in lyon')
        expect(input.prompt).toContain('- [m2] (fact) the ceo is alice')
        expect(input.abortSignal).toBeInstanceOf(AbortSignal)
    })

    it('writes a new memory when the model returns null', async () => {
        store.recallMemory.mockResolvedValue([candidate('m1', 'the ceo is alice')])
        structured.generateStructured.mockResolvedValue({ updateId: null })
        const result = await reconcileWrite(agent, 'the office is in paris', 'fact', [])
        expect(result).toEqual({ id: 'new-id', updated: false })
        expect(store.updateMemory).not.toHaveBeenCalled()
    })

    it('ignores an id the model made up and writes a new memory', async () => {
        store.recallMemory.mockResolvedValue([candidate('m1', 'the ceo is alice')])
        structured.generateStructured.mockResolvedValue({ updateId: 'hallucinated' })
        const result = await reconcileWrite(agent, 'the office is in paris', 'fact', [])
        expect(result).toEqual({ id: 'new-id', updated: false })
        expect(store.updateMemory).not.toHaveBeenCalled()
        expect(store.writeMemory).toHaveBeenCalledWith(agent, 'the office is in paris', 'fact', [])
    })

    it('warns and writes a new memory when the model call throws', async () => {
        store.recallMemory.mockResolvedValue([candidate('m1', 'the ceo is alice')])
        structured.generateStructured.mockRejectedValue(new Error('provider down'))
        const result = await reconcileWrite(agent, 'the office is in paris', 'note', ['x'])
        expect(result).toEqual({ id: 'new-id', updated: false })
        expect(store.writeMemory).toHaveBeenCalledWith(agent, 'the office is in paris', 'note', ['x'])
        expect(warnings).toHaveLength(1)
        expect(warnings[0][1]).toBe('memory reconcile failed')
        expect(String((warnings[0][0] as { err: string }).err)).toContain('provider down')
    })
})
