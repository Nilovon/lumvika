import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope } from '@/test/db-fake'

const state = vi.hoisted(() => ({ locale: 'en' as string | null, agents: [] as { engine_agent_id: string | null }[], patched: [] as unknown[] }))

vi.mock('@/lib/db', async importOriginal => ({
    ...(await importOriginal<object>()),
    selectMaybeSingle: async () => ({ data: { locale: state.locale } }),
    selectMany: async () => ({ data: state.agents }),
}))
vi.mock('@/app/api/_services/workspace-engine.service', () => ({ getWorkspaceConnection: async () => ({ host: 'engine' }) }))
vi.mock('@/lib/engine/client', () => ({
    patchAgent: async (_conn: unknown, id: string, patch: unknown) => {
        if (id === 'broken') throw new Error('engine down')
        state.patched.push({ id, patch })
    },
}))

const { applyCoworkerLanguage, coworkerLanguageFor } = await import('./coworker-language.service')
const scope = fakeScope()

describe('coworker language', () => {
    beforeEach(() => {
        state.patched = []
        state.agents = []
    })

    // Every workspace made before the column reads 'en': pinning them would turn a German team's
    // routines to English.
    it('pins a new coworker only to a language other than English', async () => {
        state.locale = 'en'
        expect(await coworkerLanguageFor(scope, 1)).toBeNull()
        state.locale = 'de'
        expect(await coworkerLanguageFor(scope, 1)).toBe('de')
        state.locale = 'xx'
        expect(await coworkerLanguageFor(scope, 1)).toBeNull()
    })

    it('gives every coworker the language an admin picked, English included, past one that fails', async () => {
        state.agents = [{ engine_agent_id: 'a1' }, { engine_agent_id: 'broken' }, { engine_agent_id: null }, { engine_agent_id: 'a2' }]
        vi.spyOn(console, 'error').mockImplementation(() => {})
        await applyCoworkerLanguage(scope, 1, 'en')
        expect(state.patched).toEqual([
            { id: 'a1', patch: { language: 'en' } },
            { id: 'a2', patch: { language: 'en' } },
        ])
    })
})
