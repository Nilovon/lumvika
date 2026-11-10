import { mkdtempSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEnvFile, readEnvFile, serializeEnv, writeEnvFile } from './env-file.js'

const scratch = () => mkdtempSync(resolve(tmpdir(), 'rerun-envfile-'))

describe('parseEnvFile', () => {
    it('skips blank lines, comments and lines without an equals sign', () => {
        expect(parseEnvFile('\n# comment\nNOPE\nA=1\n   \n')).toEqual({ A: '1' })
    })

    it('trims keys and values, and handles CRLF', () => {
        expect(parseEnvFile('  A  =  one  \r\nB=two\r\n')).toEqual({ A: 'one', B: 'two' })
    })

    it('strips matching quotes only', () => {
        expect(parseEnvFile(`A="double"\nB='single'\nC="mixed'\nD="`)).toEqual({ A: 'double', B: 'single', C: `"mixed'`, D: '' })
    })

    it('keeps an equals sign inside the value', () => {
        expect(parseEnvFile('URL=https://x.test/?a=b=c')).toEqual({ URL: 'https://x.test/?a=b=c' })
    })

    it('lets the last duplicate win', () => {
        expect(parseEnvFile('A=1\nA=2')).toEqual({ A: '2' })
    })
})

describe('serializeEnv', () => {
    it('writes one key per line and round-trips through the parser', () => {
        const env = { A: '1', TOKEN: 'sk-abc=def', EMPTY: '' }
        const text = serializeEnv(env)
        expect(text).toBe('A=1\nTOKEN=sk-abc=def\nEMPTY=')
        expect(parseEnvFile(text)).toEqual(env)
    })

    it('trims a pasted value instead of refusing its trailing newline', () => {
        expect(serializeEnv({ KEY: '  pasted-secret\n' })).toBe('KEY=pasted-secret')
    })

    it.each(['one\nINJECTED=1', 'one\rtwo'])('refuses a line break inside a value (%j)', value => {
        expect(() => serializeEnv({ KEY: value })).toThrow(expect.objectContaining({ status: 400, message: 'The value of KEY cannot contain a line break.' }))
    })

    it.each(['', 'A=B', 'A\nB'])('refuses the key %j', key => {
        expect(() => serializeEnv({ [key]: 'x' })).toThrow(expect.objectContaining({ status: 400 }))
    })
})

describe('readEnvFile / writeEnvFile', () => {
    it('reads a missing file as empty', async () => {
        expect(await readEnvFile(resolve(scratch(), '.env'))).toEqual({})
    })

    it('writes a 0600 file, overwrites the previous one and leaves no temp file behind', async () => {
        const dir = scratch()
        const path = resolve(dir, '.env')
        await writeFile(path, 'OLD=1\n', { mode: 0o644 })

        await writeEnvFile(path, { A: '1', B: 'two' })

        expect(await readEnvFile(path)).toEqual({ A: '1', B: 'two' })
        expect((await stat(path)).mode & 0o777).toBe(0o600)
        expect(await readdir(dir)).toEqual(['.env'])
    })

    it('leaves the existing file untouched when the payload is refused', async () => {
        const path = resolve(scratch(), '.env')
        await writeEnvFile(path, { A: '1' })

        await expect(writeEnvFile(path, { A: 'x\nB=2' })).rejects.toThrow(/line break/)

        expect(await readFile(path, 'utf8')).toBe('A=1')
    })
})
