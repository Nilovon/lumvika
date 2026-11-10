import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-sessions-'))
process.env.RERUN_API_KEY = ''

const { afterEach, describe, expect, it, vi } = await import('vitest')
const { createSession, getSession, listSessions, sessionBelongsToAgent, touchSession } = await import('./sessions.js')

afterEach(() => {
    vi.useRealTimers()
})

function at(iso: string) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
}

describe('createSession', () => {
    it('defaults to an untitled open dashboard session without origin', async () => {
        at('2026-09-01T00:00:00.000Z')
        const session = await createSession('create')
        expect(session).toMatchObject({
            agentId: 'create',
            title: 'Untitled',
            status: 'open',
            source: 'dashboard',
            originAgentId: null,
            originSessionId: null,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
        })
        expect(await getSession('create', session.id)).toEqual(session)
    })

    it('records the origin and the source', async () => {
        const session = await createSession('create', 'delegated: triage', { originAgentId: 'boss', originSessionId: 'boss-s' }, 'delegate')
        expect(await getSession('create', session.id)).toMatchObject({ title: 'delegated: triage', source: 'delegate', originAgentId: 'boss', originSessionId: 'boss-s' })
    })

    it('returns undefined for an unknown session', async () => {
        expect(await getSession('create', 'ghost')).toBeUndefined()
    })
})

describe('touchSession', () => {
    it('bumps updatedAt and moves the session to the top', async () => {
        at('2026-09-01T00:00:00.000Z')
        const first = await createSession('touch', 'First')
        at('2026-09-02T00:00:00.000Z')
        const second = await createSession('touch', 'Second')
        expect((await listSessions('touch')).map(s => s.id)).toEqual([second.id, first.id])

        at('2026-09-03T00:00:00.000Z')
        await touchSession('touch', first.id)

        expect(await getSession('touch', first.id)).toMatchObject({ title: 'First', updatedAt: '2026-09-03T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' })
        expect((await listSessions('touch')).map(s => s.id)).toEqual([first.id, second.id])
    })

    it('renames when a title is given and ignores an empty one', async () => {
        const session = await createSession('touch', 'Before')
        await touchSession('touch', session.id, 'After')
        expect((await getSession('touch', session.id))?.title).toBe('After')
        await touchSession('touch', session.id, '')
        expect((await getSession('touch', session.id))?.title).toBe('After')
    })
})

describe('sessionBelongsToAgent', () => {
    it('is true only for a session of that agent', async () => {
        const session = await createSession('owner')
        expect(await sessionBelongsToAgent(session.id, 'owner')).toBe(true)
        expect(await sessionBelongsToAgent('ghost', 'owner')).toBe(false)
        expect(await sessionBelongsToAgent(session.id, 'intruder')).toBe(false)
    })
})
