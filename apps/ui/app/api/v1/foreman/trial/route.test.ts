import { describe, expect, it, vi } from 'vitest'

const workspace = { id: 7, subscription_status: null as string | null }

vi.mock('@/app/api/_auth/ownership', async importOriginal => ({
    ...(await importOriginal<typeof import('@/app/api/_auth/ownership')>()),
    requireWorkspaceContext: async () => ({ userId: 'user-1', authUser: { id: 'user-1' }, workspace, role: 'admin', supabase: {} }),
    requireAdminContext: async () => ({ userId: 'user-1', authUser: { id: 'user-1' }, workspace, role: 'admin', supabase: {} }),
}))

const { POST } = await import('./route')

describe('POST /api/v1/foreman/trial', () => {
    it('answers that the workspace is on', async () => {
        const res = await POST(new Request('https://app.example.com/api/v1/foreman/trial', { method: 'POST' }), { params: Promise.resolve({}) })
        expect(await res.json()).toEqual({ entitled: true })
    })
})
