// No 'server-only': the lifecycle sweeper imports this from a Trigger.dev task, the same way
// `recommend.ts` does.
import { warmImage } from '@/lib/og/warm'

// One capture per warm-up, and lumvika-shot runs two tabs at a time before it queues: an email with
// three picks is warmed in two rounds rather than fired at once.
const WARM_CONCURRENCY = 2

// A cold capture is a real browser on a shared service. Longer than the send itself is fine; what
// is not fine is holding a sweep hostage, so this is well under lumvika-shot's own 30s.
const WARM_TIMEOUT_MS = 25_000

/**
 * What makes an email card image stale. Not `updated_at` alone: `card-render.ts` deliberately leaves
 * it untouched when it recaptures a board, so a regenerated thumbnail would never reach the email.
 * The stored file carries a fresh UUID on every capture, which covers an edit and a plain
 * regeneration both; `updated_at` is the fallback for a template with no board at all.
 */
export function templateCardStamp(row: { updated_at: string | null; card_image_dark_url: string | null }): string {
    const file = row.card_image_dark_url?.split('/').pop()?.split('?')[0]
    return file || row.updated_at || 'none'
}

// Bumped when the card itself is redrawn. The stamp only moves with the template, so without this a
// new layout would keep the URL every mail client has already cached the old picture under.
const EMAIL_CARD_LAYOUT = '2'

/**
 * The card of a template, captured at the size of an email column. The `v` is not read by the route,
 * which versions its own cache: it exists to break the Gmail image proxy, which keys on the URL
 * alone and holds it for everybody.
 */
export function templateEmailCardUrl(appUrl: string, slug: string, stamp: string): string {
    return `${appUrl}/og/templates/${encodeURIComponent(slug)}/email-card?v=${encodeURIComponent(`${EMAIL_CARD_LAYOUT}.${stamp}`)}`
}

/**
 * Capture the cards an email is about to link, and report which ones are actually there. Never
 * throws: a missing picture costs the message its illustration, never its delivery.
 */
export async function warmTemplateEmailCards(urls: string[]): Promise<Set<string>> {
    const ready = new Set<string>()

    for (let index = 0; index < urls.length; index += WARM_CONCURRENCY) {
        const batch = urls.slice(index, index + WARM_CONCURRENCY)
        const results = await Promise.all(batch.map(url => warmImage(url, WARM_TIMEOUT_MS)))
        batch.forEach((url, at) => {
            if (results[at]) ready.add(url)
        })
    }

    return ready
}
