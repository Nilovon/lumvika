import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const dataDir = mkdtempSync(resolve(tmpdir(), 'lumvika-triggers-'))
process.env.LUMVIKA_DATA_DIR = dataDir

const { describe, expect, it, beforeEach } = await import('vitest')
const { triggerTools } = await import('./trigger.js')
const { readTrigger, writeTrigger } = await import('../../triggers/loader.js')

const id = 'testagent'
const ctx = { agent: { id, resolved: { connection: { id: 'cnx-claude' }, provider: 'claude', model: 'claude-opus-4-8' } }, provider: 'claude', model: 'claude-opus-4-8' } as any
const tools = triggerTools(ctx)
const slug = 'incoming-lead'

const BODY = ['Handle the incoming lead.', '', '1. Qualify the payload.', '2. Create the CRM record.'].join('\n')

async function run(name: string, args: Record<string, unknown>): Promise<string> {
    return (await (tools[name] as any).execute(args, {} as any)) as string
}

beforeEach(async () => {
    await writeTrigger(id, {
        name: 'Incoming lead',
        description: 'Fires when the form is submitted',
        body: BODY,
        methods: ['POST'],
        provider: 'claude',
        model: 'claude-opus-4-8',
    })
})

describe('trigger_get', () => {
    it('returns the full instruction body', async () => {
        const res = await run('trigger_get', { slug })
        expect(res).toContain('Incoming lead (incoming-lead)')
        expect(res).toContain('2. Create the CRM record.')
    })
})

describe('trigger_edit', () => {
    it('replaces one excerpt and preserves the rest', async () => {
        const res = await run('trigger_edit', { slug, oldString: '2. Create the CRM record.', newString: '2. Create the CRM record and notify sales.' })
        expect(res).toBe('Edited trigger incoming-lead (1 replacement)')
        const trigger = await readTrigger(id, slug)
        expect(trigger.body).toContain('notify sales')
        expect(trigger.body).toContain('1. Qualify the payload.')
        expect(trigger.methods).toEqual(['POST'])
    })

    it('keeps the token, so the public URL survives an edit', async () => {
        const before = await readTrigger(id, slug)
        await run('trigger_edit', { slug, oldString: '1. Qualify the payload.', newString: '1. Qualify and score the payload.' })
        expect((await readTrigger(id, slug)).token).toBe(before.token)
    })

    it('points at trigger_get when oldString is absent, and changes nothing', async () => {
        const res = await run('trigger_edit', { slug, oldString: 'a line that was never there', newString: 'whatever' })
        expect(res).toContain('Call trigger_get to read the current body')
        expect(res).toContain('Never fall back to rewriting the whole body from memory')
        expect((await readTrigger(id, slug)).body).toBe(BODY)
    })

    it('refuses an ambiguous match without replaceAll', async () => {
        const res = await run('trigger_edit', { slug, oldString: 'the', newString: 'THE' })
        expect(res).toContain('pass replaceAll or provide a more specific string')
        expect((await readTrigger(id, slug)).body).toBe(BODY)
    })
})

describe('trigger_update', () => {
    it('reports the size of a body it replaced', async () => {
        const res = await run('trigger_update', { slug, body: 'Handle the incoming lead.' })
        expect(res).toBe(`Updated trigger ${slug} (body replaced: ${BODY.length} → 25 chars)`)
    })

    it('leaves the body alone when none is passed', async () => {
        const res = await run('trigger_update', { slug, enabled: false })
        expect(res).toBe(`Updated trigger ${slug}`)
        const trigger = await readTrigger(id, slug)
        expect(trigger.body).toBe(BODY)
        expect(trigger.enabled).toBe(false)
    })
})
