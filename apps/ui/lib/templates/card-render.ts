import type { Database } from '@/app/api/database.types'
import { bucketName, removeObjects } from '@lumvika/storage'

import { uploadPublicImage } from '@/lib/images/upload'
import { CARD_HEIGHT, CARD_SCALE, CARD_THEMES, CARD_WIDTH, type CardTheme } from '@/lib/og/size'
import { capturePage } from '@/lib/og/shot'
import { site } from '@/lib/site'
import { selectMaybeSingle, serviceScope, updateRows, type DbScope } from '@/lib/db'

import { agentsFromRow } from './document'
import { TEMPLATE_MEDIA_BUCKET } from './images'

// The board capture is an artefact, not a response: it is produced by a write and stored, so a
// visitor never waits on a browser. Two of them, one per theme, because the board is theme-aware
// and a dark slab in a light card is the one thing this whole feature must not ship.
//
// Its own folder inside the template media bucket, beside the authored gallery images: that is what
// makes deleting an old capture safe to do by path.
const CARD_FOLDER = 'cards'

// A capture is 1200x630 at DPR 2, and the stored file keeps those pixels: the cards are rendered at
// a third of that width, so the retina variant next/image derives comes from real pixels.
const CARD_MAX_SIZE = CARD_WIDTH * CARD_SCALE

const CARD_COLUMNS = ['id', 'agents', 'card_image_dark_url', 'card_image_light_url'] as const

// The pair as every caller reads it: the row's two columns, `null` for a template with no board.
export type TemplateCardUrls = { dark: string | null; light: string | null }

export type TemplateCardRender = { urls: TemplateCardUrls; changed: boolean }

type TemplateCardRow = Pick<Database['public']['Tables']['templates']['Row'], (typeof CARD_COLUMNS)[number]>

const publicPrefix = () => `/${bucketName(TEMPLATE_MEDIA_BUCKET)}/${CARD_FOLDER}/`

// The row holds public URLs, and removing an object needs the path inside the bucket. Anything that
// is not a capture of ours yields nothing and is left alone: an authored cover lives in the same
// bucket, and passing one here must never delete it.
function cardStoragePath(url: string | null): string | null {
    if (!url) return null
    const prefix = publicPrefix()
    const at = url.indexOf(prefix)
    if (at === -1) return null
    return `${CARD_FOLDER}/${decodeURIComponent(url.slice(at + prefix.length).split('?')[0])}`
}

// Exported for the one caller outside a regeneration: deleting a template, which otherwise leaves
// its pair of webp behind in the bucket forever.
export async function removeCards(_scope: DbScope, urls: (string | null)[]): Promise<void> {
    const paths = urls.map(cardStoragePath).filter((path): path is string => path !== null)
    if (paths.length === 0) return
    await removeObjects(TEMPLATE_MEDIA_BUCKET, paths)
}

// The job runs outside any request (a write fires it and returns), so there is no incoming URL to
// derive the origin from: lumvika-shot is pointed at the configured public app.
function appOrigin(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? site.url
}

async function captureTheme(scope: DbScope, slug: string, theme: CardTheme): Promise<string> {
    const capture = await capturePage(`/render/templates/${encodeURIComponent(slug)}/card?theme=${theme}`, {
        requestUrl: appOrigin(),
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        scale: CARD_SCALE,
        format: 'png',
        // Regenerating is a deliberate gesture, so lumvika-shot's disk cache is bypassed rather than
        // versioned: nothing has to travel in the URL to make a capture fresh.
        fresh: true,
    })

    return uploadPublicImage(scope, capture.body, TEMPLATE_MEDIA_BUCKET, CARD_FOLDER, { maxSize: CARD_MAX_SIZE })
}

async function writeCards(scope: DbScope, row: TemplateCardRow, dark: string | null, light: string | null): Promise<void> {
    // `updated_at` is deliberately untouched: it is the author's timestamp, and moving it here would
    // make every regeneration look like an edit.
    const { error } = await updateRows(scope, 'templates', { card_image_dark_url: dark, card_image_light_url: light }, { id: row.id })
    if (error) throw new Error(error.message)
    // The previous pair stays in the bucket: every name is new, and a page cached before this write
    // (ISR, a tab left open, a lazy image not yet scrolled to) still asks for it.
}

/**
 * Recapture the board of a template and store one image per theme, returning the pair now on the
 * row. Throws on anything that went wrong, so a caller with somebody to tell (the admin lab, the
 * backfill script) can say what happened.
 */
export async function captureTemplateCard(slug: string): Promise<TemplateCardRender> {
    const scope = serviceScope()

    const { data: row, error } = await selectMaybeSingle(scope, 'templates', CARD_COLUMNS, { slug })
    if (error) throw new Error(error.message)
    if (!row) throw new Error(`No template found with slug "${slug}"`)

    const current: TemplateCardUrls = { dark: row.card_image_dark_url, light: row.card_image_light_url }

    // No captured agent, no board: TemplateBoardPreview would render nothing and the capture would
    // be an empty frame. The cards fall back to the authored cover instead.
    if (agentsFromRow.parse(row.agents).length === 0) {
        if (!current.dark && !current.light) return { urls: current, changed: false }
        await writeCards(scope, row, null, null)
        return { urls: { dark: null, light: null }, changed: true }
    }

    // One theme after the other rather than both at once: the backfill already walks several
    // templates in parallel, and each capture is a real browser on a shared service.
    const uploaded: Partial<Record<CardTheme, string>> = {}
    try {
        for (const theme of CARD_THEMES) uploaded[theme] = await captureTheme(scope, slug, theme)
    } catch (failure) {
        // Half a pair is worse than the previous one: the row keeps pointing at the old images, so
        // what was already uploaded is dropped rather than left behind in the bucket.
        await removeCards(scope, Object.values(uploaded)).catch(() => {})
        throw failure
    }

    const urls: TemplateCardUrls = { dark: uploaded.dark ?? null, light: uploaded.light ?? null }
    await writeCards(scope, row, urls.dark, urls.light)
    return { urls, changed: true }
}

/**
 * The same thing for a write path: whether the row moved, which is what tells the caller the
 * landing is worth revalidating a second time. Never throws, because a catalogue thumbnail is not
 * worth failing a save over, and keeping the previous pair on screen beats showing a hole.
 */
export async function renderTemplateCard(slug: string): Promise<boolean> {
    try {
        const { changed } = await captureTemplateCard(slug)
        return changed
    } catch (error) {
        console.error(`[templates] card render failed for ${slug}`, error)
        return false
    }
}
