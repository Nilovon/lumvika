import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-memfiles-'))
process.env.LUMVIKA_API_KEY = ''

const { describe, expect, it } = await import('vitest')
const { existsSync } = await import('node:fs')
const { mkdir, readFile, writeFile } = await import('node:fs/promises')
const { writeMemoryFile, updateMemoryFile, archiveMemoryFile, deleteMemoryFile, deleteAllMemoryFiles, readMemoryFile, listMemoryFiles, memoryFileExists } = await import('./files.js')
const { HttpError } = await import('../lib/errors.js')

const memoryDir = (agentId: string) => resolve(process.env.LUMVIKA_DATA_DIR!, 'agents', agentId, 'memory')

describe('writeMemoryFile', () => {
    it('writes a trimmed body with frontmatter and returns the parsed memory', async () => {
        const file = await writeMemoryFile('write-agent', '  the office is in paris \n\n', 'fact', ['office'])
        expect(file.content).toBe('the office is in paris')
        expect(file.kind).toBe('fact')
        expect(file.tags).toEqual(['office'])
        expect(file.id).toBeTruthy()
        expect(file.path).toBe(resolve(memoryDir('write-agent'), `${file.id}.md`))
        expect(memoryFileExists('write-agent', file.id)).toBe(true)

        const raw = await readFile(file.path, 'utf8')
        expect(raw).toMatch(/^---\n/)
        expect(raw).toContain(`id: ${file.id}`)
        expect(raw).toContain('kind: fact')

        expect(await readMemoryFile(file.path)).toEqual({ ...file, updatedAt: undefined })
    })

    it('defaults to a note with no tags', async () => {
        const file = await writeMemoryFile('write-defaults', 'plain')
        expect(file.kind).toBe('note')
        expect(file.tags).toEqual([])
    })
})

describe('updateMemoryFile', () => {
    it('replaces the body, keeps kind, tags and createdAt, and stamps updatedAt', async () => {
        const original = await writeMemoryFile('update-agent', 'old body', 'preference', ['a', 'b'])
        const updated = await updateMemoryFile('update-agent', original.id, ' new body ')
        expect(updated).toMatchObject({ id: original.id, kind: 'preference', tags: ['a', 'b'], createdAt: original.createdAt, content: 'new body', path: original.path })
        expect(updated.updatedAt).toBeTruthy()
        expect(await readMemoryFile(original.path)).toEqual(updated)
    })

    it('throws when the memory does not exist', async () => {
        await expect(updateMemoryFile('update-missing', 'ghost', 'x')).rejects.toMatchObject({ code: 'ENOENT' })
    })
})

describe('archiveMemoryFile', () => {
    it('moves the file into the archive subfolder, which listing ignores', async () => {
        const file = await writeMemoryFile('archive-agent', 'to be archived')
        const kept = await writeMemoryFile('archive-agent', 'to be kept')
        await archiveMemoryFile('archive-agent', file.id)
        expect(memoryFileExists('archive-agent', file.id)).toBe(false)
        expect(existsSync(resolve(memoryDir('archive-agent'), 'archive', `${file.id}.md`))).toBe(true)
        expect((await listMemoryFiles('archive-agent')).map(f => f.id)).toEqual([kept.id])
    })

    it('throws when the memory does not exist', async () => {
        await expect(archiveMemoryFile('archive-missing', 'ghost')).rejects.toMatchObject({ code: 'ENOENT' })
    })
})

describe('deleteMemoryFile', () => {
    it('removes the file', async () => {
        const file = await writeMemoryFile('delete-agent', 'bye')
        await deleteMemoryFile('delete-agent', file.id)
        expect(memoryFileExists('delete-agent', file.id)).toBe(false)
    })

    it('is a no-op for a missing file', async () => {
        await expect(deleteMemoryFile('delete-agent', 'ghost')).resolves.toBeUndefined()
    })
})

describe('deleteAllMemoryFiles', () => {
    it('removes the whole memory folder, archive included', async () => {
        const file = await writeMemoryFile('delete-all-agent', 'one')
        await writeMemoryFile('delete-all-agent', 'two')
        await archiveMemoryFile('delete-all-agent', file.id)
        await deleteAllMemoryFiles('delete-all-agent')
        expect(existsSync(memoryDir('delete-all-agent'))).toBe(false)
        expect(await listMemoryFiles('delete-all-agent')).toEqual([])
    })

    it('is a no-op when the agent never had memories', async () => {
        await expect(deleteAllMemoryFiles('delete-all-empty')).resolves.toBeUndefined()
    })
})

describe('readMemoryFile', () => {
    it('falls back to defaults for missing or mistyped frontmatter fields', async () => {
        await mkdir(memoryDir('malformed-agent'), { recursive: true })
        const path = resolve(memoryDir('malformed-agent'), 'broken.md')
        await writeFile(path, '---\nid: 42\nkind: [x]\ntags: nope\ncreatedAt: 7\nupdatedAt: false\n---\n\n  body text  \n', 'utf8')
        expect(await readMemoryFile(path)).toEqual({ id: '', kind: 'note', tags: [], createdAt: '', updatedAt: undefined, content: 'body text', path })
    })

    it('stringifies non-string tags', async () => {
        await mkdir(memoryDir('tags-agent'), { recursive: true })
        const path = resolve(memoryDir('tags-agent'), 'tags.md')
        await writeFile(path, '---\ntags: [1, true, x]\n---\nbody', 'utf8')
        expect((await readMemoryFile(path)).tags).toEqual(['1', 'true', 'x'])
    })

    it('reads a file with no frontmatter at all', async () => {
        await mkdir(memoryDir('bare-agent'), { recursive: true })
        const path = resolve(memoryDir('bare-agent'), 'bare.md')
        await writeFile(path, 'just a body\n', 'utf8')
        expect(await readMemoryFile(path)).toMatchObject({ id: '', kind: 'note', tags: [], createdAt: '', content: 'just a body' })
    })
})

describe('listMemoryFiles', () => {
    it('returns an empty list when the folder does not exist', async () => {
        expect(await listMemoryFiles('list-nobody')).toEqual([])
    })

    it('lists only markdown files at the top level', async () => {
        const a = await writeMemoryFile('list-agent', 'first')
        const b = await writeMemoryFile('list-agent', 'second')
        await writeFile(resolve(memoryDir('list-agent'), 'notes.txt'), 'ignored', 'utf8')
        await mkdir(resolve(memoryDir('list-agent'), 'folder.md'), { recursive: true })
        const ids = (await listMemoryFiles('list-agent')).map(f => f.id).sort()
        expect(ids).toEqual([a.id, b.id].sort())
    })
})

describe('memory ids', () => {
    it.each(['../x', 'a/b', '..', '.', ''])('rejects %j with a 400', async id => {
        const attempt = () => memoryFileExists('ids-agent', id)
        expect(attempt).toThrow(HttpError)
        try {
            attempt()
        } catch (err) {
            expect((err as InstanceType<typeof HttpError>).status).toBe(400)
            expect((err as Error).message).toContain('memory id')
        }
    })

    it('rejects a traversal id on every path-taking operation', async () => {
        await expect(updateMemoryFile('ids-agent', '../x', 'x')).rejects.toMatchObject({ status: 400 })
        await expect(deleteMemoryFile('ids-agent', '../x')).rejects.toMatchObject({ status: 400 })
        await expect(archiveMemoryFile('ids-agent', '../x')).rejects.toMatchObject({ status: 400 })
    })

    it('rejects a traversal agent id', async () => {
        await expect(writeMemoryFile('../evil', 'x')).rejects.toMatchObject({ status: 400 })
    })
})
