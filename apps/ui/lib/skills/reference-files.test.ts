import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EngineConnection } from '@/lib/engine/types'
import { MAX_SKILL_FILE_CHARS, describeSkillFiles, planSkillFileRemovals, readSkillReferenceFile, removeSkillFiles } from './reference-files'

const conn: EngineConnection = { baseUrl: 'http://engine.test', apiKey: 'key' }

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown }

function mockEngine(handler: Handler): { calls: { url: string; method: string }[] } {
    const calls: { url: string; method: string }[] = []
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
        calls.push({ url: input, method: init?.method ?? 'GET' })
        const { status = 200, body } = handler(input, init)
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    })
    return { calls }
}

function entry(name: string, size: number) {
    return { name, type: 'file' as const, size, modifiedAt: '2026-01-01T00:00:00.000Z' }
}

afterEach(() => vi.unstubAllGlobals())

describe('describeSkillFiles', () => {
    it('lists each directory once and pairs every file with its size', async () => {
        const { calls } = mockEngine(url => {
            if (url.includes('path=references')) return { body: { entries: [entry('a.md', 12), entry('b.md', 34)] } }
            return { body: { entries: [entry('notes.txt', 7)] } }
        })

        const files = await describeSkillFiles(conn, 'agent-1', 'weekly-report', ['references/a.md', 'references/b.md', 'notes.txt'])

        expect(files).toEqual([
            { path: 'references/a.md', bytes: 12 },
            { path: 'references/b.md', bytes: 34 },
            { path: 'notes.txt', bytes: 7 },
        ])
        expect(calls).toHaveLength(2)
    })

    it('keeps the paths when a listing fails, without a size', async () => {
        mockEngine(() => ({ status: 500, body: { error: 'boom' } }))

        expect(await describeSkillFiles(conn, 'agent-1', 'weekly-report', ['references/a.md'])).toEqual([{ path: 'references/a.md' }])
    })
})

describe('readSkillReferenceFile', () => {
    it('reads a bundled file', async () => {
        mockEngine(() => ({ body: { path: 'references/a.md', content: '# A' } }))

        expect(await readSkillReferenceFile(conn, 'agent-1', 'weekly-report', './references/a.md')).toEqual({
            path: 'references/a.md',
            content: '# A',
            offset: 0,
            nextOffset: null,
            totalChars: 3,
            truncated: false,
        })
    })

    it('flags a file the engine cut at its read limit', async () => {
        mockEngine(() => ({ body: { path: 'references/a.md', content: 'x'.repeat(MAX_SKILL_FILE_CHARS) } }))

        expect(await readSkillReferenceFile(conn, 'agent-1', 'weekly-report', 'references/a.md')).toMatchObject({
            offset: 0,
            nextOffset: MAX_SKILL_FILE_CHARS,
            totalChars: null,
            truncated: true,
        })
    })

    it('reads a later page and forwards the engine pagination metadata', async () => {
        const { calls } = mockEngine(() => ({
            body: { path: 'references/a.md', content: 'tail', offset: MAX_SKILL_FILE_CHARS, nextOffset: null, totalChars: MAX_SKILL_FILE_CHARS + 4, truncated: false },
        }))

        expect(await readSkillReferenceFile(conn, 'agent-1', 'weekly-report', 'references/a.md', MAX_SKILL_FILE_CHARS)).toMatchObject({
            content: 'tail',
            offset: MAX_SKILL_FILE_CHARS,
            nextOffset: null,
            totalChars: MAX_SKILL_FILE_CHARS + 4,
            truncated: false,
        })
        expect(calls[0]!.url).toContain(`offset=${MAX_SKILL_FILE_CHARS}`)
    })

    it('asks for an engine update when an old engine is used past the first page', async () => {
        mockEngine(() => ({ body: { path: 'references/a.md', content: 'first page again' } }))

        await expect(readSkillReferenceFile(conn, 'agent-1', 'weekly-report', 'references/a.md', MAX_SKILL_FILE_CHARS)).rejects.toThrow('machine of this workspace must be updated')
    })

    it('rejects an invalid offset before calling the engine', async () => {
        const { calls } = mockEngine(() => ({ body: {} }))

        await expect(readSkillReferenceFile(conn, 'agent-1', 'weekly-report', 'references/a.md', -1)).rejects.toThrow('non-negative integer')
        expect(calls).toHaveLength(0)
    })

    it('refuses a binary file and SKILL.md', async () => {
        mockEngine(() => ({ body: {} }))

        await expect(readSkillReferenceFile(conn, 'agent-1', 'weekly-report', 'references/cover.png')).rejects.toThrow('not a text file')
        await expect(readSkillReferenceFile(conn, 'agent-1', 'weekly-report', 'SKILL.md')).rejects.toThrow('get_skill')
    })

    it('turns the engine 500 on a missing file into an answer the caller can act on', async () => {
        mockEngine(() => ({ status: 500, body: { error: 'ENOENT' } }))

        await expect(readSkillReferenceFile(conn, 'agent-1', 'weekly-report', 'references/gone.md')).rejects.toThrow('No readable file "references/gone.md" in skill "weekly-report"')
    })
})

describe('removeSkillFiles', () => {
    it('deletes each path', async () => {
        const { calls } = mockEngine(() => ({ body: { path: 'references/a.md' } }))

        expect(await removeSkillFiles(conn, 'agent-1', 'weekly-report', ['references/a.md', './references/b.md'])).toEqual(['references/a.md', 'references/b.md'])
        expect(calls.map(call => call.method)).toEqual(['DELETE', 'DELETE'])
        expect(calls[1]!.url).toContain('path=references%2Fb.md')
    })

    it('refuses SKILL.md before deleting anything', async () => {
        const { calls } = mockEngine(() => ({ body: {} }))

        await expect(removeSkillFiles(conn, 'agent-1', 'weekly-report', ['references/a.md', 'SKILL.md'])).rejects.toThrow('SKILL.md')
        expect(calls).toHaveLength(0)
        expect(() => planSkillFileRemovals(['./SKILL.md'])).toThrow('SKILL.md')
        expect(() => planSkillFileRemovals(['references/../SKILL.md'])).toThrow('SKILL.md')
    })

    it('refuses the skill folder itself and anything above it before deleting anything', async () => {
        const { calls } = mockEngine(() => ({ body: {} }))

        for (const path of ['.', '..', 'references/..', '../other-skill/SKILL.md', '//etc', '//skills/weekly-report']) {
            await expect(removeSkillFiles(conn, 'agent-1', 'weekly-report', ['references/a.md', path])).rejects.toThrow('not a file of the skill')
        }
        expect(calls).toHaveLength(0)
        expect(planSkillFileRemovals(['references/old.md', './references/b.md', 'references/../references/c.md'])).toEqual(['references/old.md', 'references/b.md', 'references/c.md'])
    })
})
