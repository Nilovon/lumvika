import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => mocks.headers }))
vi.mock('@/lib/auth/auth', () => ({ getAuth: () => ({ api: { getSession: async () => null } }) }))

const { getRequestWorkspaceId } = await import('./request')
const { withQueryWorkspace } = await import('@/lib/workspace/query-workspace')

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
