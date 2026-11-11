import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTabWorkspace, installWorkspaceHeader, pinTabWorkspace, readTabWorkspace, readUrlWorkspace, withTabWorkspace } from './tab-workspace'

function memoryStorage() {
    const items = new Map<string, string>()
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
        removeItem: (key: string) => void items.delete(key),
    }
}

const nativeFetch = vi.fn<typeof fetch>(async () => new Response('ok'))

function sentHeaders(call = 0) {
    const init = nativeFetch.mock.calls[call][1]
    return new Headers(init?.headers)
}

beforeEach(() => {
    nativeFetch.mockClear()
    vi.stubGlobal('sessionStorage', memoryStorage())
    vi.stubGlobal('window', { location: { href: 'https://app.lumvika.test/?agent=a1', origin: 'https://app.lumvika.test' }, fetch: nativeFetch })
    installWorkspaceHeader()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('tab workspace pin', () => {
    it('reads back what the tab pinned, and nothing once cleared', () => {
        expect(readTabWorkspace()).toBeNull()
        pinTabWorkspace(42)
        expect(readTabWorkspace()).toBe(42)
        clearTabWorkspace()
        expect(readTabWorkspace()).toBeNull()
    })

    it('reads the workspace a page load names in its URL, and nothing otherwise', () => {
        expect(readUrlWorkspace()).toBeNull()
        window.location.href = 'https://app.lumvika.test/?workspace=7'
        expect(readUrlWorkspace()).toBe(7)
        window.location.href = 'https://app.lumvika.test/?workspace=7x'
        expect(readUrlWorkspace()).toBeNull()
    })

    it('appends the pinned workspace to a URL the browser loads on its own', () => {
        expect(withTabWorkspace('/api/files/raw?path=a')).toBe('/api/files/raw?path=a')
        pinTabWorkspace(7)
        expect(withTabWorkspace('/api/files/raw?path=a')).toBe('/api/files/raw?path=a&workspace=7')
        expect(withTabWorkspace('/api/data/export')).toBe('/api/data/export?workspace=7')
    })
})

describe('installWorkspaceHeader', () => {
    it('names the pinned workspace on a same-origin request', async () => {
        pinTabWorkspace(7)
        await window.fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' } })
        expect(sentHeaders().get('x-workspace-id')).toBe('7')
        expect(sentHeaders().get('content-type')).toBe('application/json')
    })

    it('never sends it to another origin', async () => {
        pinTabWorkspace(7)
        await window.fetch('https://api.example.com/v1/agents')
        expect(sentHeaders().has('x-workspace-id')).toBe(false)
    })

    it('leaves a request alone while the tab has no pin', async () => {
        await window.fetch('/api/chat')
        expect(sentHeaders().has('x-workspace-id')).toBe(false)
    })

    it('keeps a workspace the caller named itself', async () => {
        pinTabWorkspace(7)
        await window.fetch('/api/chat', { headers: { 'x-workspace-id': '9' } })
        expect(sentHeaders().get('x-workspace-id')).toBe('9')
    })

    it('wraps fetch once however many times it is installed', async () => {
        installWorkspaceHeader()
        pinTabWorkspace(7)
        await window.fetch('/api/chat')
        expect(nativeFetch).toHaveBeenCalledOnce()
    })
})
