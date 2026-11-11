import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeScope } from '@/test/db-fake'
import type { ChangelogEntryInput } from './entry'

const db = await vi.hoisted(async () => (await import('@/test/db-fake')).fakeDb())
vi.mock('@/lib/db', async importOriginal => ({ ...(await importOriginal<object>()), ...db.helpers }))
vi.mock('@/lib/landing-revalidate', () => ({ revalidateLanding: vi.fn() }))
vi.mock('./images', () => ({ normalizeChangelogImage: vi.fn(async (_scope: unknown, url: string) => url) }))

const { upsertChangelogEntry } = await import('./entry')

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

const scope = fakeScope('service')

function existing(publishedAt: string | null) {
    db.answer(call => {
        if (call.helper === 'selectMaybeSingle' && call.table === 'changelog_entries') return { data: { id: 1, published_at: publishedAt } }
        if (call.helper === 'upsertRows') return { data: [{ slug: input.slug }] }
        return undefined
    })
}

const upserts = () => db.callsTo('upsertRows', 'changelog_entries').map(call => call.args)

describe('upsertChangelogEntry with draftsOnly', () => {
    beforeEach(() => {
        db.reset()
    })

    it('refuses to overwrite an entry that is already published', async () => {
        existing('2026-11-01T00:00:00.000Z')

        const result = await upsertChangelogEntry(scope, input, { draftsOnly: true })

        expect(result).toEqual({ ok: false, status: 409, error: expect.any(String) })
        expect(upserts()).toEqual([])
    })

    it('saves a draft over an unpublished entry', async () => {
        existing(null)

        const result = await upsertChangelogEntry(scope, input, { draftsOnly: true })

        expect(result.ok).toBe(true)
        expect(upserts()).toEqual([[expect.objectContaining({ published_at: null }), expect.objectContaining({ onConflict: ['slug'] })]])
    })

    it('lets an admin overwrite a published entry', async () => {
        existing('2026-11-01T00:00:00.000Z')

        const result = await upsertChangelogEntry(scope, { ...input, publish: true })

        expect(result.ok).toBe(true)
        expect(upserts()).toEqual([[expect.objectContaining({ published_at: '2026-11-01T00:00:00.000Z' }), expect.objectContaining({ onConflict: ['slug'] })]])
    })
})
