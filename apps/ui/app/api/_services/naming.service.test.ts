import { beforeEach, describe, expect, it, vi } from 'vitest'

import { blobUrl } from '@/lib/blobs/catalog'
import { faviconUrl } from '@/lib/onboarding/site-favicon'

const WORKSPACE_ID = 7
const FOUNDER = 'user-1'
const COMPANY = { company_name: 'Acme', company_url: 'https://acme.com' }

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@/lib/auth/session/getServerSession', () => ({ getServerSession: async () => ({ session: null }) }))
vi.mock('@/app/api/_auth/ownership', () => ({ workspaceFounderUserId: async () => FOUNDER }))

const { ensureWorkspaceNamed } = await import('./naming.service')

function workspaceWithIcon(iconUrl: string | null) {
    db.reset()
    db.answer(call => {
        if (call.helper === 'selectSingle' && call.table === 'workspaces') return { data: { id: WORKSPACE_ID, name: 'My workspace', icon_url: iconUrl, is_sandbox: false } }
        if (call.table === 'workspace_onboarding') return { data: { answers: COMPANY } }
        return undefined
    })
}

const iconWritten = () => (db.callsTo('updateRows', 'workspaces')[0]?.args[0] as { icon_url?: string } | undefined)?.icon_url

beforeEach(() => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(null, { status: 200 }))
    )
})

describe('ensureWorkspaceNamed and the company favicon', () => {
    it('gives the favicon to a workspace with no icon', async () => {
        workspaceWithIcon(null)

        await ensureWorkspaceNamed({ workspaceId: WORKSPACE_ID, userId: FOUNDER })

        expect(iconWritten()).toBe(faviconUrl('acme.com'))
    })

    it('replaces an illustration nobody picked', async () => {
        workspaceWithIcon(blobUrl('green-energy-blob.webp'))

        await ensureWorkspaceNamed({ workspaceId: WORKSPACE_ID, userId: FOUNDER })

        expect(iconWritten()).toBe(faviconUrl('acme.com'))
    })

    it('keeps a logo picked by hand', async () => {
        workspaceWithIcon('https://db.lumvika.test/storage/v1/object/public/workspace-logos/7/logo.webp')

        await ensureWorkspaceNamed({ workspaceId: WORKSPACE_ID, userId: FOUNDER })

        expect(iconWritten()).toBeUndefined()
    })
})
