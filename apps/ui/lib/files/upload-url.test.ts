import { describe, expect, it } from 'vitest'
import { uploadUrl } from './upload-url'

const query = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams)

describe('uploadUrl', () => {
    it('streams an agent upload through the engine proxy with its agent id', () => {
        const url = uploadUrl({ kind: 'agent', agentId: 'a1' }, 'docs', 'a b&c.txt', 12)
        expect(url.startsWith('/api/files/stream?')).toBe(true)
        expect(query(url)).toEqual({ name: 'a b&c.txt', size: '12', dir: 'docs', agentId: 'a1' })
    })

    it('addresses the shared folder by scope', () => {
        expect(query(uploadUrl({ kind: 'shared' }, '', 'f', 1))).toEqual({ name: 'f', size: '1', scope: 'shared' })
    })

    it('sends a foreman upload to the hub bucket instead', () => {
        const url = uploadUrl({ kind: 'foreman', sessionId: 's1' }, 'in', 'f', 1)
        expect(url.startsWith('/api/foreman/files/stream?')).toBe(true)
        expect(query(url)).toEqual({ name: 'f', size: '1', dir: 'in', sessionId: 's1' })
    })
})
