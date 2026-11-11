import { captureOgCard, OG_VERSION, ogFallbackResponse, readOgRequest } from '@/lib/og/capture'
import { selectMaybeSingle, serviceScope } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const { format, fresh } = readOgRequest(req)

    const { data } = await selectMaybeSingle(serviceScope(), 'templates', ['updated_at'] as const, { slug })
    if (!data) return ogFallbackResponse(req)

    // The version travels in the captured URL, so it is part of the cache key on both sides: editing
    // a template invalidates its card everywhere without anyone having to purge anything, and
    // bumping OG_VERSION does the same for every card at once when the layout itself changes.
    const version = `${OG_VERSION}.${data.updated_at ?? ''}`

    return captureOgCard({
        req,
        renderPath: `/render/templates/${encodeURIComponent(slug)}?v=${encodeURIComponent(version)}`,
        cacheKey: `templates:${slug}:${version}:${format}`,
        format,
        fresh,
        label: `templates/${slug}`,
    })
}
