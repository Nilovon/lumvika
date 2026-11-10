import { describe, expect, it, vi } from 'vitest'

import { type RegistryEntry, type ServiceRegistry, connectorSkillOwners, entriesOfSlug, primaryStatusOfSlug, resolveRegistryEntry, sharedSkillSlugs } from './registry'

vi.mock('@/lib/engine/client', () => ({ makeDir: vi.fn(), readFileText: vi.fn(), writeFileText: vi.fn() }))

const entry = (status: RegistryEntry['status'], installedAt: string, skills: string[] = []): RegistryEntry => ({ status, config: {}, mcpServers: [], envKeys: [], skills, installedAt })

const reg: ServiceRegistry = {
    services: {
        'gmail@zzzzzz': entry('needs_auth', '2026-10-03', ['gmail-usage']),
        gmail: entry('needs_config', '2026-10-01', ['gmail-usage']),
        'gmail@k3x9ab': entry('active', '2026-10-02', ['gmail-usage', 'gmail-extra']),
        notion: entry('active', '2026-10-01', ['notion-usage']),
    },
}

describe('registry instances', () => {
    it('names the app, not the account, as the owner of a skill', () => {
        const owners = connectorSkillOwners(reg)
        expect(owners.get('gmail-extra')).toBe('gmail')
        expect(owners.get('notion-usage')).toBe('notion')
    })

    it('lists the base account first, then the others in install order', () => {
        expect(entriesOfSlug(reg, 'gmail').map(e => e.key)).toEqual(['gmail', 'gmail@k3x9ab', 'gmail@zzzzzz'])
    })

    it('resolves a bare slug to the base account only', () => {
        expect(resolveRegistryEntry(reg, 'gmail')?.key).toBe('gmail')
        expect(resolveRegistryEntry(reg, 'gmail@k3x9ab')?.key).toBe('gmail@k3x9ab')
        expect(resolveRegistryEntry({ services: { 'gmail@k3x9ab': entry('active', '') } }, 'gmail')).toBeNull()
    })

    it('keeps a skill another account of the same app still lists', () => {
        expect(sharedSkillSlugs(reg, 'gmail@k3x9ab')).toEqual(new Set(['gmail-usage']))
        expect(sharedSkillSlugs({ services: { gmail: entry('active', '', ['gmail-usage']) } }, 'gmail')).toEqual(new Set())
    })

    it('reports the base status, else the best account left', () => {
        expect(primaryStatusOfSlug(reg, 'gmail')).toBe('needs_config')
        const { gmail: _base, ...withoutBase } = reg.services
        expect(primaryStatusOfSlug({ services: withoutBase }, 'gmail')).toBe('active')
        expect(primaryStatusOfSlug(reg, 'slack')).toBeNull()
    })
})
