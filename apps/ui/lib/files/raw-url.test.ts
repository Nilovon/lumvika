import { describe, expect, it } from 'vitest'
import { agentFileRawUrl, stewardFileRawUrl, rawUrlResolver, sharedFileRawUrl } from './raw-url'

describe('raw urls', () => {
    it('encodes the path so a query character stays in the path', () => {
        expect(agentFileRawUrl('a 1', 'dir/x&y=z.txt')).toBe('/api/files/raw?agentId=a%201&path=dir%2Fx%26y%3Dz.txt')
        expect(sharedFileRawUrl('a#b')).toBe('/api/files/raw?scope=shared&path=a%23b')
        expect(stewardFileRawUrl('s1', 'f.png')).toBe('/api/steward/files/raw?sessionId=s1&path=f.png')
    })
})

describe('rawUrlResolver', () => {
    it('prefers the override', () => {
        const override = (path: string) => `/custom/${path}`
        expect(rawUrlResolver('a1', override)).toBe(override)
    })

    it('resolves through the agent when there is one, and to nothing otherwise', () => {
        expect(rawUrlResolver('a1')?.('f.txt')).toBe('/api/files/raw?agentId=a1&path=f.txt')
        expect(rawUrlResolver()).toBeNull()
        expect(rawUrlResolver('')).toBeNull()
    })
})
