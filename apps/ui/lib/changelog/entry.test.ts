import { beforeEach, describe, expect, it, vi } from 'vitest'

import { upsertChangelogEntry, type ChangelogEntryInput } from './entry'

const { selectMaybeSingle } = vi.hoisted(() => ({ selectMaybeSingle: vi.fn() }))

vi.mock('@/supabase/supabase-helpers', () => ({ selectMaybeSingle }))
vi.mock('@/lib/landing-revalidate', () => ({ revalidateLanding: vi.fn() }))
vi.mock('./images', () => ({ normalizeChangelogImage: vi.fn(async (_supabase: unknown, url: string) => url) }))

const input: ChangelogEntryInput = {
    slug: 'agents-read-your-drive',
    title: 'Your agents can read your Drive',
    body_md: 'Body.',
    image_url: '',
    image_dark_url: '',
    dialog_image_url: '',
    dialog_image_dark_url: '',
    image_alt: '',
    publish: false,
}

function fakeClient() {
    const single = vi.fn(async () => ({ data: { slug: input.slug }, error: null }))
    const upsert = vi.fn(() => ({ select: () => ({ single }) }))
    return { client: { from: vi.fn(() => ({ upsert })) }, upsert }
}

describe('upsertChangelogEntry with draftsOnly', () => {
    beforeEach(() => {
        selectMaybeSingle.mockReset()
    })

    it('refuses to overwrite an entry that is already published', async () => {
        selectMaybeSingle.mockResolvedValue({ data: { id: 1, published_at: '2026-11-01T00:00:00.000Z' }, error: null })
        const { client, upsert } = fakeClient()

        const result = await upsertChangelogEntry(client as never, input, { draftsOnly: true })

        expect(result).toEqual({ ok: false, status: 409, error: expect.any(String) })
        expect(upsert).not.toHaveBeenCalled()
    })

    it('saves a draft over an unpublished entry', async () => {
        selectMaybeSingle.mockResolvedValue({ data: { id: 1, published_at: null }, error: null })
        const { client, upsert } = fakeClient()

        const result = await upsertChangelogEntry(client as never, input, { draftsOnly: true })

        expect(result.ok).toBe(true)
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ published_at: null }), { onConflict: 'slug' })
    })

    it('lets an admin overwrite a published entry', async () => {
        selectMaybeSingle.mockResolvedValue({ data: { id: 1, published_at: '2026-11-01T00:00:00.000Z' }, error: null })
        const { client, upsert } = fakeClient()

        const result = await upsertChangelogEntry(client as never, { ...input, publish: true })

        expect(result.ok).toBe(true)
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ published_at: '2026-11-01T00:00:00.000Z' }), { onConflict: 'slug' })
    })
})
