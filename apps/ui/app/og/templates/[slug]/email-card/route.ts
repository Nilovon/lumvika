import { captureOgCard, OG_VERSION, ogFallbackResponse, readOgRequest } from '@/lib/og/capture'
import { EMAIL_CARD_HEIGHT, EMAIL_CARD_SCALE, EMAIL_CARD_WIDTH } from '@/lib/og/email-card-size'
import { templateCardStamp } from '@/lib/templates/email-card'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectMaybeSingle } from '@/supabase/supabase-helpers'

export const runtime = 'nodejs'

const STAMP_COLUMNS = ['updated_at', 'card_image_dark_url'] as const

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const { format, fresh } = readOgRequest(req)

    const supabase = createServiceRoleClient()
    const { data } = await selectMaybeSingle(supabase, 'templates', STAMP_COLUMNS, { slug })
    if (!data) return ogFallbackResponse(req)

    const version = `${OG_VERSION}.${templateCardStamp(data)}`

    return captureOgCard({
        req,
        renderPath: `/render/templates/${encodeURIComponent(slug)}/email-card?v=${encodeURIComponent(version)}`,
        cacheKey: `templates:${slug}:email-card:${version}:${format}`,
        format,
        fresh,
        label: `templates/${slug}/email-card`,
        size: { width: EMAIL_CARD_WIDTH, height: EMAIL_CARD_HEIGHT, scale: EMAIL_CARD_SCALE },
    })
}
