import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-files-routes-'))
process.env.LUMVIKA_API_KEY = ''

const { describe, expect, it, beforeAll } = await import('vitest')
const { mkdir, writeFile } = await import('node:fs/promises')
const { createServer } = await import('../server.js')
const { agentConfigSchema } = await import('../../agents/types.js')
const { writeAgentConfig } = await import('../../agents/config-write.js')
const { agentDir, sharedDir, workspaceDir } = await import('../../config/paths.js')

const id = 'filesroutes'
const app = createServer()
const base = `/agents/${id}/files`

type Entry = { name: string; type: 'file' | 'dir'; size: number }

function json(method: string, path: string, body: unknown) {
    return app.request(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

function upload(query: string, file: File | string) {
    const form = new FormData()
    form.append('file', file)
    return app.request(`${base}/raw${query}`, { method: 'POST', body: form })
}

async function entries(path = ''): Promise<Entry[]> {
    const res = await app.request(`${base}${path}`)
    expect(res.status).toBe(200)
    return ((await res.json()) as { entries: Entry[] }).entries
}

const inWorkspace = (rel: string) => resolve(workspaceDir(id), rel)

beforeAll(async () => {
    await mkdir(agentDir(id), { recursive: true })
    await writeAgentConfig(id, agentConfigSchema.parse({ name: 'files' }))
    await mkdir(inWorkspace('reports/2026'), { recursive: true })
    await writeFile(inWorkspace('b.txt'), 'bee')
    await writeFile(inWorkspace('a.txt'), 'a')
    await writeFile(inWorkspace('reports/q1.md'), '# Q1')
})

describe('listing', () => {
    it('lists the workspace root with folders first, then by name', async () => {
        const listed = await entries()
        expect(listed.map(e => [e.name, e.type])).toEqual([
            ['reports', 'dir'],
            ['a.txt', 'file'],
            ['b.txt', 'file'],
        ])
        expect(listed.find(e => e.name === 'b.txt')?.size).toBe(3)
    })

    it('lists a sub-folder', async () => {
        expect((await entries('?path=reports')).map(e => e.name)).toEqual(['2026', 'q1.md'])
    })

    it('answers an empty list for a folder that does not exist', async () => {
        expect(await entries('?path=missing')).toEqual([])
    })

    it('404s on an unknown agent', async () => {
        const res = await app.request('/agents/ghost/files')
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: 'agent not found' })
    })
})

describe('reading', () => {
    it.each(['-1', '1.5', 'abc'])('refuses the offset %s', async offset => {
        expect((await app.request(`${base}/read?path=a.txt&offset=${offset}`)).status).toBe(400)
    })

    it('reads from an offset', async () => {
        const res = await app.request(`${base}/read?path=b.txt&offset=1`)
        expect(await res.json()).toMatchObject({ path: 'b.txt', content: 'ee', offset: 1, totalChars: 3 })
    })

    it.each([
        ['photo.png', 'image/png'],
        ['NOTES.MD', 'text/markdown'],
        ['data.json', 'application/json'],
        ['archive.tar', 'application/octet-stream'],
        ['README', 'application/octet-stream'],
    ])('serves %s raw as %s', async (name, mime) => {
        await writeFile(inWorkspace(`reports/${name}`), 'x')
        const res = await app.request(`${base}/raw?path=reports/${name}`)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe(mime)
        expect(res.headers.get('content-disposition')).toBe(`inline; filename="${name}"`)
    })

    it('serves the exact bytes', async () => {
        const bytes = new Uint8Array([0, 255, 10, 13])
        await writeFile(inWorkspace('blob.bin'), bytes)
        const res = await app.request(`${base}/raw?path=blob.bin`)
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
    })

    it('404s on a raw file that is not there and 400s without a path', async () => {
        expect((await app.request(`${base}/raw?path=ghost.png`)).status).toBe(404)
        const res = await app.request(`${base}/raw`)
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: 'Missing "path" query parameter' })
    })
})

describe('multipart upload', () => {
    it('writes the file under its own name', async () => {
        const res = await upload('', new File(['hello'], 'hello.txt'))
        expect(res.status).toBe(201)
        expect(await res.json()).toEqual({ path: 'hello.txt', bytes: 5 })
        expect(readFileSync(inWorkspace('hello.txt'), 'utf8')).toBe('hello')
    })

    it('files it into a directory, trailing slash or not', async () => {
        expect(await (await upload('?dir=uploads/', new File(['1'], 'one.txt'))).json()).toEqual({ path: 'uploads/one.txt', bytes: 1 })
        expect(await (await upload('?dir=uploads', new File(['22'], 'two.txt'))).json()).toEqual({ path: 'uploads/two.txt', bytes: 2 })
        expect(existsSync(inWorkspace('uploads/two.txt'))).toBe(true)
    })

    it('writes it at an explicit path over the directory', async () => {
        expect(await (await upload('?dir=ignored&path=exact/place.bin', new File(['abc'], 'orig.bin'))).json()).toEqual({ path: 'exact/place.bin', bytes: 3 })
    })

    it('refuses a form without a file', async () => {
        const res = await upload('', 'just text')
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: 'Expected a multipart "file" field' })
    })
})

describe('streamed upload', () => {
    it('refuses a request with no body', async () => {
        const res = await app.request(`${base}/raw?name=x.bin`, { method: 'PUT' })
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: 'Expected the file bytes as the request body' })
    })
})

describe('moving, creating folders and deleting', () => {
    it('moves a file into a folder it creates', async () => {
        await writeFile(inWorkspace('move-me.txt'), 'moving')
        const res = await json('POST', `${base}/move`, { from: 'move-me.txt', to: 'archive/moved.txt' })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ from: 'move-me.txt', to: 'archive/moved.txt' })
        expect(existsSync(inWorkspace('move-me.txt'))).toBe(false)
        expect(readFileSync(inWorkspace('archive/moved.txt'), 'utf8')).toBe('moving')
    })

    it('404s on moving a file that is not there and 400s on a bad body', async () => {
        expect((await json('POST', `${base}/move`, { from: 'nothing.txt', to: 'x.txt' })).status).toBe(404)
        expect((await json('POST', `${base}/move`, { from: '', to: 'x.txt' })).status).toBe(400)
    })

    it('creates a nested folder', async () => {
        const res = await json('POST', `${base}/dir`, { path: 'deep/nested/folder' })
        expect(res.status).toBe(201)
        expect(await res.json()).toEqual({ path: 'deep/nested/folder' })
        expect((await entries('?path=deep/nested')).map(e => [e.name, e.type])).toEqual([['folder', 'dir']])
        expect((await json('POST', `${base}/dir`, {})).status).toBe(400)
    })

    it('deletes a folder with what it holds', async () => {
        await mkdir(inWorkspace('trash/inner'), { recursive: true })
        await writeFile(inWorkspace('trash/inner/file.txt'), 'x')
        const res = await app.request(`${base}?path=trash`, { method: 'DELETE' })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ path: 'trash' })
        expect(existsSync(inWorkspace('trash'))).toBe(false)
    })

    it('needs a path to delete and accepts one that is already gone', async () => {
        expect((await app.request(base, { method: 'DELETE' })).status).toBe(400)
        expect((await app.request(`${base}?path=never-there`, { method: 'DELETE' })).status).toBe(200)
    })
})

describe('shared files', () => {
    it('reads and writes the shared folder without naming an agent', async () => {
        expect((await json('PUT', '/shared/files', { path: 'team/notes.md', content: 'shared' })).status).toBe(201)
        expect(readFileSync(resolve(sharedDir(), 'team/notes.md'), 'utf8')).toBe('shared')
        const res = await app.request('/shared/files?path=team')
        expect(((await res.json()) as { entries: Entry[] }).entries.map(e => e.name)).toEqual(['notes.md'])
    })

    it('keeps the shared folder apart from the workspaces', async () => {
        expect((await app.request(`/shared/files/read?path=${encodeURIComponent('../agents/filesroutes/workspace/a.txt')}`)).status).toBe(400)
    })
})

describe('the root itself', () => {
    it.each(['.', 'docs/..', workspaceDir(id)])('cannot be deleted through %j', async path => {
        const res = await app.request(`${base}?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: 'The root folder cannot be deleted' })
        expect(existsSync(inWorkspace('a.txt'))).toBe(true)
    })

    it('cannot be moved', async () => {
        const res = await json('POST', `${base}/move`, { from: '.', to: 'elsewhere' })
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: 'The root folder cannot be moved' })
        expect(existsSync(inWorkspace('a.txt'))).toBe(true)
    })

    it('is protected on the shared folder too', async () => {
        expect((await app.request('/shared/files?path=.', { method: 'DELETE' })).status).toBe(400)
        expect(existsSync(resolve(sharedDir(), 'team/notes.md'))).toBe(true)
    })
})
