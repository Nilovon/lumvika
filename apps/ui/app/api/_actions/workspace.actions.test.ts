import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BLOB_ILLUSTRATIONS, blobUrl } from '@/lib/blobs/catalog'
import { faviconUrl } from '@/lib/onboarding/site-favicon'
import { WORKSPACE_NAME_MAX } from '@/lib/naming/workspace-name'
import type { DbAnswer, DbCall } from '@/test/db-fake'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))

const mocks = vi.hoisted(() => ({ getServerSession: vi.fn(), uploadPublicImage: vi.fn(), lookup: vi.fn(), grantLumvikaTopup: vi.fn() }))

vi.mock('@/lib/auth/session/getServerSession', () => ({ getServerSession: mocks.getServerSession, getSessionWorkspace: mocks.getServerSession }))
vi.mock('@/app/api/_auth/expert', () => ({ hasPendingCreatorTerms: vi.fn(), isExpertAccount: vi.fn(), requireSandboxWorkspaceId: vi.fn() }))
vi.mock('@/app/api/_services/sandbox.service', () => ({ enterSandbox: vi.fn(), ensureSandboxSpace: vi.fn() }))
vi.mock('@/lib/images/upload', () => ({ uploadPublicImage: mocks.uploadPublicImage }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('@lumvika/cloud/billing.server', () => ({ grantLumvikaTopup: mocks.grantLumvikaTopup }))
// The public build stubs `@lumvika/cloud/billing` with no signup allowance, so the test pins one of its own.
const SIGNUP_ALLOWANCE_MICROS = vi.hoisted(() => 5_000_000)
vi.mock('@lumvika/cloud/billing', async (importOriginal) => ({ ...(await importOriginal<typeof import('@lumvika/cloud/billing')>()), SIGNUP_BUDGET_MICROS: SIGNUP_ALLOWANCE_MICROS }))
vi.mock('@lumvika/cloud/illustrations', () => ({
    ILLUSTRATION_ENTRIES: [
        { file: 'green-energy-blob.webp', desc: 'Green blob', color: 'green', form: 'blob' },
        { file: 'blue-vortex-ring.webp', desc: 'Blue vortex', color: 'blue', form: 'vortex' },
    ],
}))

const { createWorkspaceAction, switchWorkspaceAction, updateWorkspaceAction } = await import('./workspace.actions')

const WORKSPACE_ID = 7
const BUCKET_URL = 'https://db.lumvika.test/storage/v1/object/public/workspace-logos/7/logo.webp'

function formOf(fields: Record<string, string | File>): FormData {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    return form
}

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))

function imageResponse(contentType = 'image/png'): Response {
    return new Response(PNG, { status: 200, headers: { 'content-type': contentType } })
}

function database(resolve: (call: DbCall) => DbAnswer | undefined = () => undefined) {
    db.answer(resolve)
}

const WRITES: Partial<Record<DbCall['helper'], string>> = { insertRow: 'insert', insertRows: 'insert', updateRows: 'update', deleteRows: 'delete' }

// Each write on the table: its method, the row or patch it carries, and the filters of an update.
function writes(table: string) {
    return db.calls
        .filter(call => call.table === table && WRITES[call.helper])
        .map(call => ({ method: WRITES[call.helper], payload: call.args[0], ...(call.helper === 'updateRows' ? { filters: call.args[1] } : {}) }))
}

beforeEach(() => {
    vi.clearAllMocks()
    db.reset()
    vi.unstubAllGlobals()
    mocks.uploadPublicImage.mockResolvedValue(BUCKET_URL)
    mocks.lookup.mockResolvedValue([{ address: '93.184.215.14', family: 4 }])
    mocks.getServerSession.mockResolvedValue({
        user: { id: 'user-1', workspace_id: WORKSPACE_ID },
        workspace: { id: WORKSPACE_ID, name: 'Acme' },
        session: { id: 'user-1', email: 'me@acme.test' },
        workspaceRefused: false,
    })
})

describe('switchWorkspaceAction', () => {
    it('refuses a workspace the caller is not a member of, without touching the active one', async () => {
        database()

        await expect(switchWorkspaceAction(99)).resolves.toEqual({ ok: false, error: 'You are not a member of this workspace', code: 'notMember' })
        expect(writes('users')).toHaveLength(0)
    })

    it('makes a workspace of the caller the active one', async () => {
        database(call => (call.table === 'workspace_members' && call.helper === 'selectSingle' ? { data: { workspace_id: 42 } } : undefined))

        await expect(switchWorkspaceAction(42)).resolves.toEqual({ ok: true })
        expect(writes('users')).toEqual([{ method: 'update', payload: { workspace_id: 42 }, filters: { id: 'user-1' } }])
    })
})

describe('updateWorkspaceAction', () => {
    function memberDatabase(role: 'admin' | 'member' = 'admin') {
        return database(call => (call.table === 'workspace_members' ? { data: { user_id: 'user-1', role } } : undefined))
    }

    it('refuses a member who is not an admin', async () => {
        memberDatabase('member')

        await expect(updateWorkspaceAction(formOf({ name: 'Acme' }))).resolves.toEqual({ ok: false, error: 'Only an admin can change the workspace settings', code: 'adminOnlySettings' })
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('refuses an empty name', async () => {
        memberDatabase()

        await expect(updateWorkspaceAction(formOf({ name: '   ' }))).resolves.toEqual({ ok: false, error: 'Name is required', code: 'nameRequired' })
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('refuses a name past the maximum length', async () => {
        memberDatabase()

        await expect(updateWorkspaceAction(formOf({ name: 'x'.repeat(WORKSPACE_NAME_MAX + 1) }))).resolves.toMatchObject({ ok: false })
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('refuses an icon that is not in the catalogue, so no URL from the browser reaches icon_url', async () => {
        memberDatabase()

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', iconFile: 'https://evil.test/x.svg' }))).resolves.toEqual({ ok: false, error: 'Unknown icon', code: 'unknownIcon' })
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('stores the catalogue URL of a picked icon', async () => {
        memberDatabase()

        await expect(updateWorkspaceAction(formOf({ name: ' Acme ', iconFile: 'green-energy-blob.webp' }))).resolves.toEqual({ ok: true })

        const [write] = writes('workspaces')
        expect(write.payload).toEqual({ name: 'Acme', icon_url: blobUrl('green-energy-blob.webp') })
        expect(write.filters).toEqual({ id: WORKSPACE_ID })
    })

    it('renames without touching the icon when none was picked', async () => {
        memberDatabase()

        await updateWorkspaceAction(formOf({ name: 'Acme' }))

        expect(writes('workspaces')[0].payload).toEqual({ name: 'Acme' })
        expect(mocks.uploadPublicImage).not.toHaveBeenCalled()
    })

    it('re-hosts an uploaded logo and stores only the bucket URL', async () => {
        memberDatabase()
        const file = new File([PNG], 'logo.png', { type: 'image/png' })

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoFile: file }))).resolves.toEqual({ ok: true })

        expect(mocks.uploadPublicImage).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'workspace-logos', String(WORKSPACE_ID), { maxSize: 256 })
        expect(writes('workspaces')[0].payload).toEqual({ name: 'Acme', icon_url: BUCKET_URL })
    })

    it('draws an SVG logo at the stored size rather than at its own tiny viewBox', async () => {
        memberDatabase()
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="red"/></svg>'
        const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' })

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoFile: file }))).resolves.toEqual({ ok: true })

        const { default: sharp } = await import('sharp')
        const stored = mocks.uploadPublicImage.mock.calls[0][1] as Uint8Array
        await expect(sharp(stored).metadata()).resolves.toMatchObject({ format: 'png', width: 256, height: 256 })
    })

    it('refuses an uploaded file that is not an image', async () => {
        memberDatabase()
        const file = new File(['<html></html>'], 'logo.html', { type: 'text/html' })

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoFile: file }))).resolves.toMatchObject({ ok: false })
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('refuses an uploaded image past 8MB', async () => {
        memberDatabase()
        const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'logo.png', { type: 'image/png' })

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoFile: file }))).resolves.toEqual({ ok: false, error: 'Image is too large (max 8MB).', code: 'imageTooLarge', params: { max: 8 } })
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('refuses an uploaded file the image pipeline cannot decode', async () => {
        memberDatabase()
        mocks.uploadPublicImage.mockRejectedValue(new Error('Input buffer contains unsupported image format'))
        const file = new File(['not really a png'], 'logo.png', { type: 'image/png' })

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoFile: file }))).resolves.toMatchObject({ ok: false })
        expect(writes('workspaces')).toHaveLength(0)
    })

    it.each(['http://169.254.169.254/logo.png', 'http://127.0.0.1:3000/logo.png', 'http://10.0.0.1/logo.png', 'http://[::1]/logo.png'])('refuses a link to a private address without fetching it: %s', async link => {
        memberDatabase()
        const fetch = vi.fn()
        vi.stubGlobal('fetch', fetch)

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoLink: link }))).resolves.toEqual({ ok: false, error: 'No logo found at this address', code: 'noLogoFound' })
        expect(fetch).not.toHaveBeenCalled()
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('refuses a link that does not answer with an image', async () => {
        memberDatabase()
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse('text/html')))

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoLink: 'https://acme.test/logo.png' }))).resolves.toEqual({ ok: false, error: 'No logo found at this address', code: 'noLogoFound' })
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('refuses a public-looking name that resolves to a private address', async () => {
        memberDatabase()
        mocks.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }])
        const fetch = vi.fn()
        vi.stubGlobal('fetch', fetch)

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoLink: 'https://metadata.acme.test/logo.png' }))).resolves.toEqual({ ok: false, error: 'No logo found at this address', code: 'noLogoFound' })
        expect(fetch).not.toHaveBeenCalled()
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('refuses a redirect to a private address', async () => {
        memberDatabase()
        const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/logo.png' } }))
        vi.stubGlobal('fetch', fetch)

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoLink: 'https://acme.test/logo.png' }))).resolves.toEqual({ ok: false, error: 'No logo found at this address', code: 'noLogoFound' })
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(writes('workspaces')).toHaveLength(0)
    })

    it('stores the favicon of a site, re-hosted, never the URL that was typed', async () => {
        memberDatabase()
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://t1.gstatic.com/faviconV2?url=https://acme.com' } }))
            .mockResolvedValueOnce(imageResponse())
        vi.stubGlobal('fetch', fetch)

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoLink: 'https://www.acme.com/pricing' }))).resolves.toEqual({ ok: true })

        expect(fetch.mock.calls[0][0]).toBe(faviconUrl('acme.com'))
        expect(writes('workspaces')[0].payload).toEqual({ name: 'Acme', icon_url: BUCKET_URL })
    })

    it('stores a direct image link re-hosted in the bucket', async () => {
        memberDatabase()
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()))

        await expect(updateWorkspaceAction(formOf({ name: 'Acme', logoLink: 'https://cdn.acme.test/brand/logo.svg' }))).resolves.toEqual({ ok: true })

        expect(writes('workspaces')[0].payload).toEqual({ name: 'Acme', icon_url: BUCKET_URL })
    })
})

describe('createWorkspaceAction', () => {
    const NEW_WORKSPACE_ID = 42
    const CATALOGUE_URLS = BLOB_ILLUSTRATIONS.map(blob => blob.url)

    function creatableDatabase() {
        return database(call => (call.table === 'workspaces' && call.helper === 'insertRow' ? { data: { id: NEW_WORKSPACE_ID } } : undefined))
    }

    it.each([
        ['a catalogue file on another host', 'https://evil.test/storage/v1/object/public/blob-illustrations/green-energy-blob.webp'],
        ['a catalogue url with something appended', `${blobUrl('green-energy-blob.webp')}?track=1`],
        ['a file the catalogue does not hold', blobUrl('not-in-the-catalogue.webp')],
        ['a script url', 'javascript:alert(1)'],
    ])('refuses %s as the icon without creating anything', async (_label, iconUrl) => {
        creatableDatabase()

        await expect(createWorkspaceAction('Acme', iconUrl)).resolves.toEqual({ ok: false, error: 'Unknown icon', code: 'unknownIcon' })
        expect(db.calls).toHaveLength(0)
    })

    it('keeps an icon picked from the catalogue', async () => {
        creatableDatabase()
        const iconUrl = BLOB_ILLUSTRATIONS[1].url

        await expect(createWorkspaceAction('Acme', iconUrl)).resolves.toEqual({ ok: true, workspaceId: NEW_WORKSPACE_ID })
        expect(writes('workspaces')[0].payload).toMatchObject({ icon_url: iconUrl })
    })

    it('draws an icon from the catalogue when none is picked', async () => {
        creatableDatabase()

        await expect(createWorkspaceAction('Acme')).resolves.toEqual({ ok: true, workspaceId: NEW_WORKSPACE_ID })
        expect(CATALOGUE_URLS).toContain((writes('workspaces')[0].payload as { icon_url: string }).icon_url)
    })

    it('starts the new workspace on the signup allowance rather than on zero credit', async () => {
        creatableDatabase()

        await expect(createWorkspaceAction('Acme')).resolves.toEqual({ ok: true, workspaceId: NEW_WORKSPACE_ID })
        expect(mocks.grantLumvikaTopup).toHaveBeenCalledWith(NEW_WORKSPACE_ID, SIGNUP_ALLOWANCE_MICROS)
    })

    it('grants nothing when the workspace could not be created', async () => {
        database(() => ({ data: null }))

        await createWorkspaceAction('Acme')
        expect(mocks.grantLumvikaTopup).not.toHaveBeenCalled()
    })
})
