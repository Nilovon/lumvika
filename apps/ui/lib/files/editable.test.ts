import { describe, expect, it } from 'vitest'

import { applyEol, fileEditBlockReason, hashText, looksBinary, splitEol } from './editable'

describe('looksBinary', () => {
    it('flags content holding a NUL byte', () => {
        expect(looksBinary('binary\u0000payload')).toBe(true)
    })

    it('flags content mostly made of replacement characters', () => {
        expect(looksBinary('\uFFFD\uFFFD\uFFFDok')).toBe(true)
    })

    it('lets accented prose through', () => {
        expect(looksBinary('# Résumé\n\nDes accents, des emoji 🎉, et une flèche →.')).toBe(false)
    })

    it('tolerates a lone replacement character in a long file', () => {
        expect(looksBinary('a'.repeat(1000) + '\uFFFD')).toBe(false)
    })

    it('treats an empty file as text', () => {
        expect(looksBinary('')).toBe(false)
    })
})

describe('fileEditBlockReason', () => {
    it('lets a plain text file through', () => {
        expect(fileEditBlockReason({ name: 'notes.md', truncated: false, content: '# Hello' })).toBeNull()
    })

    it('blocks a file the engine only sent a page of', () => {
        expect(fileEditBlockReason({ name: 'log.txt', truncated: true, content: 'x' })).toBe('truncated')
    })

    it('blocks anything that is not previewed as text', () => {
        expect(fileEditBlockReason({ name: 'logo.png', truncated: false, content: null })).toBe('not-text')
        expect(fileEditBlockReason({ name: 'archive.zip', truncated: false, content: null })).toBe('not-text')
    })

    it('blocks a binary hiding behind an unknown extension', () => {
        expect(fileEditBlockReason({ name: 'module.pyc', truncated: false, content: '\u0000\u0000' })).toBe('binary')
    })

    it('holds its verdict until the content is loaded', () => {
        expect(fileEditBlockReason({ name: 'module.pyc', truncated: false, content: null })).toBeNull()
    })
})

describe('hashText', () => {
    it('is stable for the same content', () => {
        expect(hashText('hello world')).toBe(hashText('hello world'))
    })

    it('changes on a single character', () => {
        expect(hashText('hello world')).not.toBe(hashText('hello worlds'))
    })

    it('handles an empty file', () => {
        expect(hashText('')).toBe(hashText(''))
    })
})

describe('end of line handling', () => {
    it('round-trips a CRLF file untouched', () => {
        const original = 'one\r\ntwo\r\nthree\r\n'
        const { text, eol } = splitEol(original)
        expect(eol).toBe('crlf')
        expect(text).toBe('one\ntwo\nthree\n')
        expect(applyEol(text, eol)).toBe(original)
    })

    it('leaves an LF file alone', () => {
        const { text, eol } = splitEol('one\ntwo\n')
        expect(eol).toBe('lf')
        expect(applyEol(text, eol)).toBe('one\ntwo\n')
    })

    it('normalises a mixed file to the dominant CRLF', () => {
        expect(applyEol(splitEol('one\r\ntwo\n').text, 'crlf')).toBe('one\r\ntwo\r\n')
    })

    it('keeps a missing trailing newline missing', () => {
        const { text, eol } = splitEol('no trailing newline')
        expect(applyEol(text, eol)).toBe('no trailing newline')
    })
})
