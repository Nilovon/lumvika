import { describe, expect, it } from 'vitest'
import { fileResponseHeaders, isInlineSafeContentType, rawFileHeaders, withUtf8Charset } from './content-type'

describe('withUtf8Charset', () => {
    it('declares utf-8 on a text type that declares no charset', () => {
        expect(withUtf8Charset('text/markdown')).toBe('text/markdown; charset=utf-8')
        expect(withUtf8Charset('text/html')).toBe('text/html; charset=utf-8')
    })

    it('keeps a charset that is already declared', () => {
        expect(withUtf8Charset('text/plain; charset=iso-8859-1')).toBe('text/plain; charset=iso-8859-1')
        expect(withUtf8Charset('text/csv;charset=UTF-8')).toBe('text/csv;charset=UTF-8')
    })

    it('leaves non-text types alone', () => {
        expect(withUtf8Charset('image/png')).toBe('image/png')
        expect(withUtf8Charset('application/json')).toBe('application/json')
    })
})

describe('rawFileHeaders', () => {
    it('renders raster images, audio, video and pdf inline from the extension', () => {
        expect(rawFileHeaders('shared/photo.JPG')).toMatchObject({ 'Content-Type': 'image/jpeg', 'Content-Disposition': "inline; filename*=UTF-8''photo.JPG" })
        expect(rawFileHeaders('voice.webm')['Content-Type']).toBe('audio/webm')
        expect(rawFileHeaders('clip.mp4')['Content-Disposition']).toMatch(/^inline/)
        expect(rawFileHeaders('deck.pdf')['Content-Type']).toBe('application/pdf')
        expect(rawFileHeaders('deck.pdf')['Content-Security-Policy']).toBeUndefined()
    })

    it('downloads everything else as octet-stream, html and text included', () => {
        for (const path of ['rapport.html', 'notes.txt', 'data.json', 'app.js', 'README', 'archive.zip']) {
            const headers = rawFileHeaders(path)
            expect(headers['Content-Type']).toBe('application/octet-stream')
            expect(headers['Content-Disposition']).toMatch(/^attachment; filename\*=UTF-8''/)
            expect(headers['X-Content-Type-Options']).toBe('nosniff')
            expect(headers['Content-Security-Policy']).toBe("default-src 'none'; sandbox")
        }
    })

    it('keeps the svg type for <img> but never opens it as a page', () => {
        expect(rawFileHeaders('logo.svg')).toMatchObject({ 'Content-Type': 'image/svg+xml', 'Content-Disposition': "attachment; filename*=UTF-8''logo.svg" })
    })

    it('escapes the file name for the header', () => {
        expect(rawFileHeaders('dir/été "2026".png')['Content-Disposition']).toBe("inline; filename*=UTF-8''%C3%A9t%C3%A9%20%222026%22.png")
    })
})

describe('fileResponseHeaders', () => {
    it('trusts a declared type only when a browser renders it without a script engine', () => {
        expect(isInlineSafeContentType('image/png')).toBe(true)
        expect(isInlineSafeContentType('application/pdf')).toBe(true)
        expect(isInlineSafeContentType('Video/MP4; codecs=avc1')).toBe(true)
        expect(isInlineSafeContentType('text/html; charset=utf-8')).toBe(false)
        expect(isInlineSafeContentType('image/svg+xml')).toBe(false)
        expect(isInlineSafeContentType('application/xhtml+xml')).toBe(false)
    })

    it('downgrades a mailed html attachment to a download', () => {
        expect(fileResponseHeaders('text/html', 'facture.html')).toEqual({
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': "attachment; filename*=UTF-8''facture.html",
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
        })
        expect(fileResponseHeaders('image/jpeg', 'photo.jpg')).toMatchObject({ 'Content-Type': 'image/jpeg', 'Content-Disposition': "inline; filename*=UTF-8''photo.jpg" })
    })
})
