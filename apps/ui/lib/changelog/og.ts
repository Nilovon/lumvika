import { OG_VERSION } from '@/lib/og/capture'
import { selectMany, serviceScope } from '@/lib/db'

const OG_ENTRY_COLUMNS = ['slug', 'title', 'image_url', 'image_dark_url', 'published_at', 'updated_at'] as const

// Three rows fit the card in full, the fourth fades out at the bottom edge.
const OG_ENTRY_COUNT = 4

export type ChangelogOgEntry = {
    slug: string
    title: string
    imageUrl: string | null
    publishedAt: string
    updatedAt: string
}

export async function getLatestChangelogEntries(): Promise<ChangelogOgEntry[]> {
    const { data, error } = await selectMany(
        serviceScope(),
        'changelog_entries',
        OG_ENTRY_COLUMNS,
        { published_at: { lte: new Date().toISOString() } },
        { column: 'published_at', ascending: false },
        OG_ENTRY_COUNT,
    )
    if (error) {
        console.error('[changelog] failed to load the entries of the og card', error.message)
        return []
    }

    return (data ?? []).flatMap(entry =>
        entry.published_at
            ? [{ slug: entry.slug, title: entry.title, imageUrl: entry.image_dark_url ?? entry.image_url, publishedAt: entry.published_at, updatedAt: entry.updated_at }]
            : [],
    )
}

// Publishing, editing or unpublishing an entry all change what the card shows, and none of them
// changes its URL: the slugs and their `updated_at` are what tells one capture from the next.
export function changelogOgVersion(entries: ChangelogOgEntry[]): string {
    return [OG_VERSION, ...entries.map(entry => `${entry.slug}@${entry.updatedAt}`)].join('.')
}
