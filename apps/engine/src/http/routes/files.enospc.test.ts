import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { vi } from 'vitest'

process.env.RERUN_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'rerun-files-enospc-'))
process.env.RERUN_API_KEY = ''

const failure = vi.hoisted(() => ({ code: 'ENOSPC' }))

vi.mock('../../files/store.js', async importOriginal => ({
    ...(await importOriginal<typeof import('../../files/store.js')>()),
    writeText: async () => {
        throw Object.assign(new Error('write failed'), { code: failure.code })
    },
}))

const { describe, expect, it } = await import('vitest')
const { createServer } = await import('../server.js')

const app = createServer()

function write() {
    return app.request('/shared/files', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: 'notes.md', content: 'x' }) })
}

describe('a write the disk refuses', () => {
    it('answers 507 when the Box is out of space', async () => {
        failure.code = 'ENOSPC'
        const res = await write()
        expect(res.status).toBe(507)
        expect(await res.json()).toEqual({ error: 'The Box has no disk space left.' })
    })

    it('lets any other filesystem error reach the app-wide handler', async () => {
        failure.code = 'EACCES'
        const res = await write()
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: 'Internal server error' })
    })
})
