import { changelogOgVersion, getLatestChangelogEntries } from '@/lib/changelog/og'
import { captureOgCard, ogFallbackResponse, readOgRequest } from '@/lib/og/capture'

export const runtime = 'nodejs'

export async function GET(req: Request) {
    const { format, fresh } = readOgRequest(req)

    const entries = await getLatestChangelogEntries()
    if (entries.length === 0) return ogFallbackResponse(req)

    const version = changelogOgVersion(entries)

    return captureOgCard({
        req,
        renderPath: `/render/changelog?v=${encodeURIComponent(version)}`,
        cacheKey: `changelog:${version}:${format}`,
        format,
        fresh,
        label: 'changelog',
    })
}
