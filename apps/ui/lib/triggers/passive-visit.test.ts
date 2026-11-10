import { describe, expect, it } from 'vitest'
import { isPassiveVisit } from './passive-visit'

function headers(init: Record<string, string>): Headers {
    return new Headers(init)
}

describe('isPassiveVisit', () => {
    it('lets a plain webhook call through', () => {
        expect(isPassiveVisit(headers({ 'user-agent': 'GitHub-Hookshot/044aadd', 'content-type': 'application/json' }))).toBe(false)
        expect(isPassiveVisit(headers({ 'user-agent': 'curl/8.7.1' }))).toBe(false)
        expect(isPassiveVisit(headers({}))).toBe(false)
    })

    it('lets a browser fetch() through', () => {
        expect(isPassiveVisit(headers({ 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' }))).toBe(false)
    })

    it('rejects a browser opening the URL', () => {
        expect(isPassiveVisit(headers({ 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' }))).toBe(true)
    })

    it('rejects a prefetch or prerender', () => {
        expect(isPassiveVisit(headers({ 'sec-purpose': 'prefetch;prerender' }))).toBe(true)
        expect(isPassiveVisit(headers({ purpose: 'prefetch' }))).toBe(true)
        expect(isPassiveVisit(headers({ 'x-moz': 'prefetch' }))).toBe(true)
    })

    it('rejects link previewers and clipboard managers', () => {
        expect(isPassiveVisit(headers({ 'user-agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' }))).toBe(true)
        expect(isPassiveVisit(headers({ 'user-agent': 'Mozilla/5.0 (compatible; Discordbot/2.0)' }))).toBe(true)
        expect(isPassiveVisit(headers({ 'user-agent': 'facebookexternalhit/1.1' }))).toBe(true)
        expect(isPassiveVisit(headers({ 'user-agent': 'Raycast/1.0' }))).toBe(true)
        expect(isPassiveVisit(headers({ 'user-agent': 'Paste/5.0 (macOS)' }))).toBe(true)
    })
})
