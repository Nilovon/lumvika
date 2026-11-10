import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-cx-resolve-'))
process.env.LUMVIKA_API_KEY = ''

const { beforeEach, describe, expect, it } = await import('vitest')
const { mkdir, rm, writeFile } = await import('node:fs/promises')
const { connectionConfigPath, connectionDir, connectionsDir } = await import('../config/paths.js')
const { unloadConnection } = await import('./registry.js')
const { connectionsOfProvider, resolveConnection, servesModel } = await import('./resolve.js')

const written: string[] = []

async function connection(id: string, provider: string, createdAt: string) {
    await mkdir(connectionDir(id), { recursive: true })
    await writeFile(connectionConfigPath(id), JSON.stringify({ name: id, provider, models: [], createdAt }))
    written.push(id)
}

beforeEach(async () => {
    for (const id of written.splice(0)) unloadConnection(id)
    await rm(connectionsDir(), { recursive: true, force: true })
})

describe('resolveConnection', () => {
    it('takes the connection named by id, whatever the provider says', async () => {
        await connection('mine', 'claude', '2026-03-01')
        await connection('older', 'openai', '2026-01-01')
        expect((await resolveConnection('mine', 'openai'))?.id).toBe('mine')
    })

    it('maps a bare provider onto its oldest connection, id breaking a tie', async () => {
        await connection('newer', 'claude', '2026-03-01')
        await connection('zeta', 'claude', '2026-01-01')
        await connection('alpha', 'claude', '2026-01-01')
        await connection('lumvika', 'lumvika', '2025-01-01')

        expect((await connectionsOfProvider('claude')).map(c => c.id)).toEqual(['alpha', 'zeta', 'newer'])
        expect((await resolveConnection(null, 'claude'))?.id).toBe('alpha')
        expect((await resolveConnection('deleted-one', 'claude'))?.id).toBe('alpha')
    })

    it('falls through to the Lumvika connection', async () => {
        await connection('lumvika', 'lumvika', '2025-01-01')
        await connection('gpt', 'openai', '2026-01-01')
        expect((await resolveConnection(null, 'claude'))?.id).toBe('lumvika')
        expect((await resolveConnection(undefined, null))?.id).toBe('lumvika')
        expect((await resolveConnection('gone', undefined))?.id).toBe('lumvika')
    })

    it('answers null on a box with nothing to fall back on', async () => {
        await connection('gpt', 'openai', '2026-01-01')
        expect(await resolveConnection(null, 'claude')).toBeNull()
        expect(await connectionsOfProvider('claude')).toEqual([])
    })
})

describe('servesModel', () => {
    const cnx = { id: 'c', config: { name: 'c', provider: 'openrouter', models: ['curated'], extraModels: ['custom/router-model'], createdAt: '' }, env: {} } as any

    it('serves the curated and the extra models', () => {
        expect(servesModel(cnx, 'curated')).toBe(true)
        expect(servesModel(cnx, 'custom/router-model')).toBe(true)
    })

    it('serves nothing else, and no model at all', () => {
        expect(servesModel(cnx, 'other')).toBe(false)
        expect(servesModel(cnx, '')).toBe(false)
        expect(servesModel(cnx, null)).toBe(false)
        expect(servesModel(cnx, undefined)).toBe(false)
    })
})
