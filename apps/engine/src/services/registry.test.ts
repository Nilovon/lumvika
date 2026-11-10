import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const dataDir = mkdtempSync(resolve(tmpdir(), 'lumvika-registry-'))
process.env.LUMVIKA_DATA_DIR = dataDir

const { describe, expect, it } = await import('vitest')
const { connectorServerStates, connectorSkillOwners } = await import('./registry.js')
const { workspaceDir } = await import('../config/paths.js')

async function writeRegistry(id: string, content: string): Promise<void> {
    await mkdir(resolve(workspaceDir(id), '.lumvika'), { recursive: true })
    await writeFile(resolve(workspaceDir(id), '.lumvika/services.json'), content, 'utf8')
}

describe('connectorSkillOwners', () => {
    it('is empty when the agent has no registry', async () => {
        expect((await connectorSkillOwners('no-registry')).size).toBe(0)
    })

    it('is empty on invalid JSON', async () => {
        await writeRegistry('broken', '{ not json')
        expect((await connectorSkillOwners('broken')).size).toBe(0)
    })

    it('is empty for a legacy entry with no skills footprint', async () => {
        await writeRegistry('legacy', JSON.stringify({ services: { fal: { status: 'active', toolNames: ['fal'] } } }))
        expect((await connectorSkillOwners('legacy')).size).toBe(0)
    })

    it('maps each skill slug to the connector that installed it', async () => {
        await writeRegistry(
            'full',
            JSON.stringify({
                services: {
                    stripe: { status: 'active', skills: ['stripe-payments', 'stripe-refunds'] },
                    notion: { status: 'needs_auth', skills: ['notion-pages'] },
                },
            }),
        )
        const owners = await connectorSkillOwners('full')
        expect(owners.get('stripe-payments')).toBe('stripe')
        expect(owners.get('stripe-refunds')).toBe('stripe')
        expect(owners.get('notion-pages')).toBe('notion')
        expect(owners.has('mine')).toBe(false)
    })

    it('names the catalog app, not the registry key, for a skill of a second account', async () => {
        await writeRegistry(
            'owners-instances',
            JSON.stringify({
                services: {
                    gmail: { status: 'active', skills: ['gmail-triage'] },
                    'gmail@k3x9ab': { status: 'active', instanceId: 'k3x9ab', skills: ['gmail-k3x9ab-triage'] },
                },
            }),
        )
        const owners = await connectorSkillOwners('owners-instances')
        expect(owners.get('gmail-triage')).toBe('gmail')
        expect(owners.get('gmail-k3x9ab-triage')).toBe('gmail')
    })
})

describe('connectorServerStates', () => {
    it('is empty when the agent has no registry', async () => {
        expect((await connectorServerStates('no-registry')).size).toBe(0)
    })

    it('maps every server a connector put on the agent to its slug and status', async () => {
        await writeRegistry(
            'servers',
            JSON.stringify({
                services: {
                    gmail: { status: 'needs_auth', mcpServers: ['gmail'], composio: { toolkit: 'gmail', serverName: 'gmail' } },
                    notion: { status: 'active', mcpServers: [], oauth: { serverName: 'notion', url: 'https://mcp.notion.com/mcp' } },
                    fal: { status: 'active', toolNames: ['fal'] },
                    stripe: { status: 'needs_config', mcpServers: [] },
                },
            }),
        )
        const states = await connectorServerStates('servers')
        expect(Object.fromEntries(states)).toEqual({
            gmail: { key: 'gmail', slug: 'gmail', status: 'needs_auth', isDefault: true },
            notion: { key: 'notion', slug: 'notion', status: 'active', isDefault: true },
            fal: { key: 'fal', slug: 'fal', status: 'active', isDefault: true },
        })
    })

    it('keeps each account of an app apart under its key, with the catalog slug and its label', async () => {
        await writeRegistry(
            'servers-instances',
            JSON.stringify({
                services: {
                    gmail: { status: 'active', label: 'me@acme.com', mcpServers: ['gmail'], composio: { serverName: 'gmail' } },
                    'gmail@k3x9ab': { status: 'needs_auth', instanceId: 'k3x9ab', label: 'support@acme.com', mcpServers: ['gmail-k3x9ab'], composio: { serverName: 'gmail-k3x9ab' } },
                    'gmail@NOT_AN_ID': { status: 'active', mcpServers: ['odd'] },
                },
            }),
        )
        const states = await connectorServerStates('servers-instances')
        expect(Object.fromEntries(states)).toEqual({
            gmail: { key: 'gmail', slug: 'gmail', label: 'me@acme.com', status: 'active', isDefault: true },
            'gmail-k3x9ab': { key: 'gmail@k3x9ab', slug: 'gmail', label: 'support@acme.com', status: 'needs_auth', isDefault: false },
            odd: { key: 'gmail@NOT_AN_ID', slug: 'gmail@NOT_AN_ID', status: 'active', isDefault: true },
        })
    })
})
