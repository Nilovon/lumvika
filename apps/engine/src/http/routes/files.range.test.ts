import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-files-range-'))
process.env.LUMVIKA_API_KEY = ''

const { describe, expect, it, beforeAll } = await import('vitest')
const { mkdir, writeFile } = await import('node:fs/promises')
const { createServer } = await import('../server.js')
const { parseByteRange } = await import('./files.js')
const { agentConfigSchema } = await import('../../agents/types.js')
const { writeAgentConfig } = await import('../../agents/config-write.js')
const { agentDir, workspaceDir } = await import('../../config/paths.js')

const id = 'rangeagent'
const app = createServer()
const clip = `/agents/${id}/files/raw?path=renders/clip.mp4`
const bytes = Uint8Array.from({ length: 1000 }, (_, index) => index % 256)

function get(range?: string): Promise<Response> {
    return app.request(clip, range ? { headers: { Range: range } } : undefined)
}

async function body(res: Response): Promise<Uint8Array> {
    return new Uint8Array(await res.arrayBuffer())
}

beforeAll(async () => {
    await mkdir(agentDir(id), { recursive: true })
    await mkdir(resolve(workspaceDir(id), 'renders'), { recursive: true })
    await writeAgentConfig(id, agentConfigSchema.parse({ name: 'range agent' }))
    await writeFile(resolve(workspaceDir(id), 'renders/clip.mp4'), bytes)
})

describe('serving a raw file by byte range', () => {
    it('serves the whole file without a Range header and says ranges are welcome', async () => {
        const res = await get()
        expect(res.status).toBe(200)
        expect(res.headers.get('accept-ranges')).toBe('bytes')
        expect(res.headers.get('content-length')).toBe('1000')
        expect(res.headers.get('content-type')).toBe('video/mp4')
        expect(await body(res)).toEqual(bytes)
    })

    it('serves a closed range', async () => {
        const res = await get('bytes=0-99')
        expect(res.status).toBe(206)
        expect(res.headers.get('content-range')).toBe('bytes 0-99/1000')
        expect(res.headers.get('content-length')).toBe('100')
        expect(await body(res)).toEqual(bytes.slice(0, 100))
    })

    it('serves an open-ended range to the end of the file', async () => {
        const res = await get('bytes=900-')
        expect(res.status).toBe(206)
        expect(res.headers.get('content-range')).toBe('bytes 900-999/1000')
        expect(await body(res)).toEqual(bytes.slice(900))
    })

    it('serves the last bytes of a suffix range', async () => {
        const res = await get('bytes=-50')
        expect(res.status).toBe(206)
        expect(res.headers.get('content-range')).toBe('bytes 950-999/1000')
        expect(await body(res)).toEqual(bytes.slice(950))
    })

    it('clamps a range that runs past the end', async () => {
        const res = await get('bytes=990-5000')
        expect(res.status).toBe(206)
        expect(res.headers.get('content-range')).toBe('bytes 990-999/1000')
        expect(await body(res)).toEqual(bytes.slice(990))
    })

    it('refuses a range that starts past the end', async () => {
        const res = await get('bytes=1000-')
        expect(res.status).toBe(416)
        expect(res.headers.get('content-range')).toBe('bytes */1000')
    })

    it('serves the whole file for several ranges or a malformed one', async () => {
        for (const range of ['bytes=0-1,5-6', 'bytes=50-10', 'items=0-1']) {
            const res = await get(range)
            expect(res.status).toBe(200)
            expect(await body(res)).toEqual(bytes)
        }
    })

    it('still 404s on a file that is not there', async () => {
        const res = await app.request(`/agents/${id}/files/raw?path=ghost.mp4`, { headers: { Range: 'bytes=0-1' } })
        expect(res.status).toBe(404)
    })
})

describe('parseByteRange', () => {
    it.each([
        ['bytes=0-0', 10, { start: 0, end: 0 }],
        ['bytes=-100', 10, { start: 0, end: 9 }],
        ['bytes=-0', 10, 'unsatisfiable'],
        ['bytes=0-', 0, 'unsatisfiable'],
        ['bytes=-', 10, null],
        [undefined, 10, null],
    ] as const)('reads %s on a file of %i bytes', (header, size, expected) => {
        expect(parseByteRange(header, size)).toEqual(expected)
    })
})
