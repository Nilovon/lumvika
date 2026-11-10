import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-agents-rename-'))
process.env.RERUN_API_KEY = ''
process.env.RERUN_HUB_BASE_URL = ''

const { describe, expect, it, beforeAll } = await import('vitest')
const { mkdir, readFile, writeFile } = await import('node:fs/promises')
const { createServer } = await import('../server.js')
const { migrate } = await import('../../db/migrate.js')
const { agentDir, skillsDir, soulPath } = await import('../../config/paths.js')
const { listAgentIndex } = await import('../../db/repos/agents.js')
const { indexMemory, listMemories } = await import('../../db/repos/memories.js')
const { writeMemoryFile } = await import('../../memory/files.js')
const { readSchedule, writeSchedule } = await import('../../schedules/loader.js')
const { readTrigger, writeTrigger } = await import('../../triggers/loader.js')
const { readPageFile, writePage } = await import('../../brain/pages.js')
const { getSharedDb, recordTableOwnership, tableOwners } = await import('../../db/sharedDb.js')
const { resolveTargetAgent } = await import('../../tools/builtin/call-agent.js')

const app = createServer()

type Detail = { id: string; config: { name: string; displayName?: string }; soul: string }

function send(method: string, path: string, body?: unknown) {
    return app.request(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
}

async function createAgent(name: string, displayName: string, soul?: string): Promise<string> {
    const res = await send('POST', '/agents', { config: { name, displayName }, soul })
    expect(res.status).toBe(201)
    return ((await res.json()) as Detail).id
}

beforeAll(() => migrate())

describe('PATCH /agents/:id with a new name', () => {
    it('moves every @mention, the brain author and the shared table owner to the new handle', async () => {
        const scout = await createAgent('scout', 'Scout')
        const lead = await createAgent('lead', 'Lead', 'When a lead comes in, ask @scout. Mail team@scout.io. Never call @scout_2.')

        await mkdir(resolve(skillsDir(lead), 'triage'), { recursive: true })
        await writeFile(resolve(skillsDir(lead), 'triage', 'SKILL.md'), 'Hand the research to @Scout.\n', 'utf8')
        await writeSchedule(lead, { name: 'Morning', cron: '0 9 * * *', body: 'Ask @scout for the list.' })
        await writeTrigger(lead, { name: 'Inbound', body: 'Forward to @scout.' })
        const memory = await writeMemoryFile(lead, 'Prefers @scout for research.')
        await indexMemory({ id: memory.id, agentId: lead, path: memory.path, content: memory.content, kind: 'note', createdAt: memory.createdAt, lastAccessedAt: null, accessCount: 0 }, null)
        await mkdir(resolve(agentDir(lead), 'memory', 'archive'), { recursive: true })
        await writeFile(resolve(agentDir(lead), 'memory', 'archive', 'old.md'), 'Used to ask @scout.\n', 'utf8')
        await writePage('acme', { title: 'Acme', type: 'customer', content: 'First customer.', sources: [], author: 'agent:scout', baseHash: null })
        await recordTableOwnership(await getSharedDb(), ['CREATE TABLE leads (id TEXT)'], 'scout')

        const res = await send('PATCH', `/agents/${scout}`, { name: 'ranger', displayName: 'Ranger' })
        expect(res.status).toBe(200)
        const detail = (await res.json()) as Detail
        expect(detail.config.name).toBe('ranger')
        expect(detail.soul).toContain('You are Ranger')
        expect(detail.soul).not.toContain('Scout')

        expect(await readFile(soulPath(lead), 'utf8')).toBe('When a lead comes in, ask @ranger. Mail team@scout.io. Never call @scout_2.')
        expect(await readFile(resolve(skillsDir(lead), 'triage', 'SKILL.md'), 'utf8')).toBe('Hand the research to @ranger.\n')
        expect((await readSchedule(lead, 'morning')).body).toBe('Ask @ranger for the list.')
        expect((await readTrigger(lead, 'inbound')).body).toBe('Forward to @ranger.')
        expect(await readFile(memory.path, 'utf8')).toContain('Prefers @ranger for research.')
        expect((await listMemories(lead)).find(m => m.id === memory.id)?.content).toBe('Prefers @ranger for research.')
        expect(await readFile(resolve(agentDir(lead), 'memory', 'archive', 'old.md'), 'utf8')).toBe('Used to ask @scout.\n')
        expect((await readPageFile('acme'))?.updatedBy).toBe('agent:ranger')
        expect((await tableOwners(await getSharedDb())).get('leads')).toBe('ranger')

        const targets = await listAgentIndex()
        expect(resolveTargetAgent('ranger', targets)).toMatchObject({ agent: { id: scout } })
        expect(resolveTargetAgent('scout', targets)).toHaveProperty('error')

        const leadDetail = (await (await send('GET', `/agents/${lead}`)).json()) as Detail
        expect(leadDetail.soul).toContain('ask @ranger')
    })

    it('leaves the soul alone when the same patch brings a new one', async () => {
        const id = await createAgent('echo', 'Echo')
        const res = await send('PATCH', `/agents/${id}`, { name: 'delta', displayName: 'Delta', soul: 'You are Echo, still.' })
        expect(((await res.json()) as Detail).soul).toBe('You are Echo, still.\n')
    })

    it('leaves the soul alone when the agent never had a display name', async () => {
        const created = await send('POST', '/agents', { config: { name: 'scout' }, soul: 'The scout goes first.' })
        const { id } = (await created.json()) as Detail
        const detail = (await (await send('PATCH', `/agents/${id}`, { displayName: 'Ranger' })).json()) as Detail
        expect(detail.config.displayName).toBe('Ranger')
        expect(detail.soul).toBe('The scout goes first.')
    })

    it('renames the soul without moving the handle when only the display name changes', async () => {
        const id = await createAgent('nova', 'Nova')
        const other = await createAgent('orbit', 'Orbit', 'Ask @nova.')
        const detail = (await (await send('PATCH', `/agents/${id}`, { displayName: 'Nova Prime' })).json()) as Detail
        expect(detail.config.name).toBe('nova')
        expect(detail.soul).toContain('You are Nova Prime')
        expect(await readFile(soulPath(other), 'utf8')).toBe('Ask @nova.')
    })
})
