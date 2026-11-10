import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    headers: new Headers(),
    createTokenClient: vi.fn((..._args: unknown[]) => ({ kind: 'token' })),
    createServerClient: vi.fn((..._args: unknown[]) => ({ kind: 'cookie' })),
}))

vi.mock('next/headers', () => ({
    headers: async () => mocks.headers,
    cookies: async () => ({ getAll: () => [], set: () => {} }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createTokenClient }))
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }))

const { createClient, getRequestAccessToken, getRequestWorkspaceId } = await import('./server')
const { withQueryWorkspace } = await import('@/lib/workspace/query-workspace')

describe('createClient', () => {
    beforeEach(() => {
        mocks.headers = new Headers()
        mocks.createTokenClient.mockClear()
        mocks.createServerClient.mockClear()
    })

    it('uses the cookie client when the request carries no bearer token', async () => {
        await expect(createClient()).resolves.toEqual({ kind: 'cookie' })
        expect(mocks.createTokenClient).not.toHaveBeenCalled()
    })

    it('forwards a bearer token so RLS runs as the mobile caller', async () => {
        mocks.headers = new Headers({ authorization: 'Bearer abc.def' })

        await expect(createClient()).resolves.toEqual({ kind: 'token' })
        const options = mocks.createTokenClient.mock.calls[0][2] as { global: { headers: Record<string, string> } }
        expect(options.global.headers.Authorization).toBe('Bearer abc.def')
        expect(mocks.createServerClient).not.toHaveBeenCalled()
    })

    it('ignores an authorization header that is not a bearer token', async () => {
        mocks.headers = new Headers({ authorization: 'Basic abc' })

        await expect(getRequestAccessToken()).resolves.toBeNull()
        await expect(createClient()).resolves.toEqual({ kind: 'cookie' })
    })
})

describe('getRequestWorkspaceId', () => {
    it('reads the workspace a bearer request names', async () => {
        mocks.headers = new Headers({ authorization: 'Bearer abc.def', 'x-workspace-id': '42' })
        await expect(getRequestWorkspaceId()).resolves.toBe(42)
    })

    it('reads the workspace a browser tab names', async () => {
        mocks.headers = new Headers({ 'x-workspace-id': '42' })
        await expect(getRequestWorkspaceId()).resolves.toBe(42)
    })

    it('lets a request naming no workspace follow the stored one', async () => {
        mocks.headers = new Headers()
        await expect(getRequestWorkspaceId()).resolves.toBeNull()
    })

    it('returns null when a bearer request names no workspace', async () => {
        mocks.headers = new Headers({ authorization: 'Bearer abc.def' })
        await expect(getRequestWorkspaceId()).resolves.toBeNull()
    })

    it('reads the workspace a URL loaded by the browser on its own names in its query', async () => {
        mocks.headers = new Headers()
        const route = withQueryWorkspace(async (_req: Request) => Response.json(await getRequestWorkspaceId()))
        const response = await route(new Request('https://lumvika.test/api/files/raw?path=a&workspace=42'))
        await expect(response.json()).resolves.toBe(42)
    })

    it('flags a header that is not a workspace id', async () => {
        mocks.headers = new Headers({ authorization: 'Bearer abc.def', 'x-workspace-id': '4x' })
        await expect(getRequestWorkspaceId()).resolves.toBeNaN()
    })
})
