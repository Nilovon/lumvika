import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { OgReadyMarker } from '@/components/og/OgReadyMarker'
import { TemplateOgStage } from '@/components/templates/TemplateOgStage'
import { OG_HEIGHT, OG_WIDTH } from '@/lib/og/size'
import { agentsFromRow, connectorsFromRow } from '@/lib/templates/document'
import { selectMaybeSingle, serviceScope } from '@/lib/db'

// Rendering surface for the screenshot service, not a page anyone browses: it holds nothing but the
// OG stage at its exact pixel size. Drafts render too, so the admin can preview one before publishing.
export const metadata: Metadata = {
    title: 'Template OG render',
    robots: { index: false, follow: false },
}

// Read fresh on every capture: a stale render would silently freeze the card the endpoint serves.
export const dynamic = 'force-dynamic'

const RENDER_COLUMNS = ['title', 'tagline', 'agents', 'connectors'] as const

export default async function TemplateOgRenderPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params

    const { data } = await selectMaybeSingle(serviceScope(), 'templates', RENDER_COLUMNS, { slug })
    if (!data) notFound()

    return (
        <main className="dark overflow-hidden bg-[#0a0a0a]" style={{ width: OG_WIDTH, height: OG_HEIGHT }}>
            {/* The dev overlay renders in the corner of the viewport, so it lands inside the capture. */}
            <style>{'nextjs-portal{display:none}'}</style>
            <TemplateOgStage
                title={data.title}
                tagline={data.tagline ?? ''}
                agents={agentsFromRow.parse(data.agents)}
                connectors={connectorsFromRow.parse(data.connectors)}
                rounded={false}
            />
            <OgReadyMarker />
        </main>
    )
}
