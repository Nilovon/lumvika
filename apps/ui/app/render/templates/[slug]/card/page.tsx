import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { OgReadyMarker } from '@/components/og/OgReadyMarker'
import { TemplateCardStage } from '@/components/templates/TemplateCardStage'
import { CARD_BACKGROUND, CARD_HEIGHT, CARD_MAX_ZOOM, CARD_THEME, CARD_THEMES, CARD_WIDTH, type CardTheme } from '@/lib/og/size'
import { agentsFromRow, connectorsFromRow } from '@/lib/templates/document'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectMaybeSingle } from '@/supabase/supabase-helpers'

// Rendering surface for the screenshot service, sibling of the OG render one page up: nothing but
// the board at its exact pixel size. Drafts render too, so a card can be judged before publishing.
export const metadata: Metadata = {
    title: 'Template card render',
    robots: { index: false, follow: false },
}

// Read fresh on every capture: a stale render would silently freeze the thumbnail the endpoint serves.
export const dynamic = 'force-dynamic'

const RENDER_COLUMNS = ['agents', 'connectors'] as const

type Search = { [key: string]: string | string[] | undefined }

const first = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw)

// Knobs rather than constants so the admin lab can sweep them without a redeploy. Out-of-range and
// unparseable values fall back rather than throw: this page is fed by a URL, not by a form.
function readMaxZoom(raw: string | string[] | undefined): number {
    const value = Number(first(raw))
    if (!Number.isFinite(value) || value < 0.3 || value > 8) return CARD_MAX_ZOOM
    return value
}

function readTheme(raw: string | string[] | undefined): CardTheme {
    const value = first(raw)
    return CARD_THEMES.find(theme => theme === value) ?? CARD_THEME
}

export default async function TemplateCardRenderPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
    const [{ slug }, search] = await Promise.all([params, searchParams])

    const supabase = createServiceRoleClient()
    const { data } = await selectMaybeSingle(supabase, 'templates', RENDER_COLUMNS, { slug })
    if (!data) notFound()

    const agents = agentsFromRow.parse(data.agents)
    // A template with no captured agent has no board to draw, and TemplateBoardPreview renders
    // nothing rather than an empty grid: the endpoint filters those out before asking for a capture.
    if (agents.length === 0) notFound()

    const theme = readTheme(search.theme)

    return (
        <main className="overflow-hidden" style={{ width: CARD_WIDTH, height: CARD_HEIGHT, background: CARD_BACKGROUND[theme] }}>
            {/* The dev overlay renders in the corner of the viewport, so it lands inside the capture. */}
            <style>{'nextjs-portal{display:none}'}</style>
            <TemplateCardStage
                agents={agents}
                connectors={connectorsFromRow.parse(data.connectors)}
                maxZoom={readMaxZoom(search.zoom)}
                theme={theme}
                rounded={false}
            />
            <OgReadyMarker />
        </main>
    )
}
