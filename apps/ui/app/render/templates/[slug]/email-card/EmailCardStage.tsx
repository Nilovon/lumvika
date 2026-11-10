'use client'

import { TemplateTile } from '@/components/templates/TemplateTile'
import { EMAIL_CARD_WIDTH } from '@/lib/og/email-card-size'
import type { LibraryTemplate } from '@/lib/templates/library'

export function EmailCardStage({ template }: { template: LibraryTemplate }) {
    return (
        <div className="dark" style={{ width: EMAIL_CARD_WIDTH }}>
            <TemplateTile template={template} className="w-full" />
        </div>
    )
}
