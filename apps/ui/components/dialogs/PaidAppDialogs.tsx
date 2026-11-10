'use client'

import type { AppSlug } from '@/lib/apps/types'
import { LinkedinProDialog } from './LinkedinProDialog'
import { WhatsappProDialog } from './WhatsappProDialog'

// Every paid app's dialog the workspace can open, mounted once beside the workspace menu.
export function PaidAppDialogs({ apps }: { apps: AppSlug[] }) {
    return (
        <>
            {apps.includes('linkedin') && <LinkedinProDialog />}
            {apps.includes('whatsapp') && <WhatsappProDialog />}
        </>
    )
}
