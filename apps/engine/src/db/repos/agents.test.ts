import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-agents-repo-'))
process.env.RERUN_API_KEY = ''

const { beforeAll, describe, expect, it } = await import('vitest')
const { migrate } = await import('../migrate.js')
const { deleteAgentIndex, getAgentIndex, insertAgentIndex, listAgentIndex, resetBusyAgents, setAgentStatus, updateAgentIndex } = await import('./agents.js')

beforeAll(async () => {
    await migrate()
})

describe('agent index', () => {
    it('inserts an idle row, renames it and deletes it', async () => {
        await insertAgentIndex('alpha', 'Alpha')
        expect(await getAgentIndex('alpha')).toMatchObject({ id: 'alpha', name: 'Alpha', status: 'idle' })
        expect((await getAgentIndex('alpha'))?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

        await updateAgentIndex('alpha', 'Alpha Prime')
        expect((await getAgentIndex('alpha'))?.name).toBe('Alpha Prime')
        expect((await listAgentIndex()).map(row => row.id)).toContain('alpha')

        await deleteAgentIndex('alpha')
        expect(await getAgentIndex('alpha')).toBeUndefined()
        expect((await listAgentIndex()).map(row => row.id)).not.toContain('alpha')
    })

    it('returns undefined for an unknown id', async () => {
        expect(await getAgentIndex('ghost')).toBeUndefined()
    })

    it('resets only busy agents to idle and counts them', async () => {
        await insertAgentIndex('b1', 'B1')
        await insertAgentIndex('b2', 'B2')
        await insertAgentIndex('b3', 'B3')
        await setAgentStatus('b1', 'busy')
        await setAgentStatus('b2', 'busy')
        await setAgentStatus('b3', 'error')

        expect(await resetBusyAgents()).toBe(2)
        expect((await getAgentIndex('b1'))?.status).toBe('idle')
        expect((await getAgentIndex('b2'))?.status).toBe('idle')
        expect((await getAgentIndex('b3'))?.status).toBe('error')
        expect(await resetBusyAgents()).toBe(0)
    })
})
