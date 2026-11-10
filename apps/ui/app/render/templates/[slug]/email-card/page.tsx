import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { OgReadyMarker } from '@/components/og/OgReadyMarker'
import { EMAIL_CARD_BACKGROUND, EMAIL_CARD_HEIGHT, EMAIL_CARD_WIDTH } from '@/lib/og/email-card-size'
import { LIBRARY_COLUMNS, toLibraryTemplates, type LibraryRow } from '@/lib/templates/library'
import { loadLibraryCreators } from '@/lib/templates/library-creators'
import { createServiceRoleClient } from '@/supabase/serviceRole'
import { selectMaybeSingle } from '@/supabase/supabase-helpers'

import { EmailCardStage } from './EmailCardStage'

// Rendering surface for the screenshot service, third sibling of the OG stage and the thumbnail one:
// the library card itself, at the width of an email column, on the surface the message will lay it
// on. Drafts render too, so a card can be judged before publishing.
export const metadata: Metadata = {
    title: 'Template email card render',
    robots: { index: false, follow: false },
}

// Read fresh on every capture: a stale render would silently freeze the card the endpoint serves.
export const dynamic = 'force-dynamic'

export default async function TemplateEmailCardRenderPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params

    const supabase = createServiceRoleClient()
    const { data } = await selectMaybeSingle(supabase, 'templates', LIBRARY_COLUMNS, { slug })
    if (!data) notFound()

    const row = data as unknown as LibraryRow
    const creators = await loadLibraryCreators(supabase, row.creator_id ? [row.creator_id] : [])
    const template = toLibraryTemplates([row], null, undefined, creators)[0]
    if (!template) notFound()

    return (
        <main className="overflow-hidden" style={{ width: EMAIL_CARD_WIDTH, height: EMAIL_CARD_HEIGHT, background: EMAIL_CARD_BACKGROUND }}>
            {/* The dev overlay renders in the corner of the viewport, so it lands inside the capture. */}
            <style>{'nextjs-portal{display:none}'}</style>
            <EmailCardStage template={template} />
            <OgReadyMarker />
        </main>
    )
}
