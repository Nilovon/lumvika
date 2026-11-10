import 'server-only'
import type { Database } from '@/app/api/database.types'
import { phoneOwnerId } from '@/app/api/_services/phone-ownership.service'
import { placeholderEmailFor } from '@/lib/auth/placeholder-email'
import { countryOfE164 } from '@/lib/phone/normalize'
import type { PhoneDeliveryStatus } from '@rerun/analytics'
import { captureServer, deterministicUuid } from '@rerun/analytics/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// Bird's verify.* events (https://bird.com/docs/guides/verify/events), the ones that say whether a
// code reached the phone. `metadata` is what sendVerification attached to the verification.
export type VerifyEventData = {
    to?: { phone_number?: string | null } | null
    channel?: string | null
    reason?: string | null
    last_attempt_reason?: string | null
    metadata?: Record<string, unknown> | null
}

const DELIVERY_STATUSES: Record<string, PhoneDeliveryStatus> = {
    'verify.attempt.sent': 'sent',
    'verify.attempt.delivered': 'delivered',
    'verify.attempt.undelivered': 'undelivered',
    'verify.verification.failed': 'failed',
    'verify.verification.verified': 'verified',
}

export const isVerifyEvent = (type: string) => type.startsWith('verify.')

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

// The person PostHog knows the visitor as, which is always an address: the account the code was
// sent for, else the account the number opens, else the one it will open once the code comes back.
async function distinctIdFor(admin: SupabaseClient<Database>, phone: string, userId: string | undefined): Promise<string> {
    const accountId = userId ?? (await phoneOwnerId(admin, phone))?.userId
    if (accountId) {
        const { data } = await admin.auth.admin.getUserById(accountId)
        if (data.user?.email) return data.user.email
    }
    return placeholderEmailFor(phone)
}

// Analytics only, so nothing here asks Bird to deliver the event again. `webhookId` is the same on
// every retry of one delivery, which makes the PostHog event land once.
export async function recordVerifyEvent(admin: SupabaseClient<Database>, type: string, data: VerifyEventData, webhookId: string | null): Promise<void> {
    const status = DELIVERY_STATUSES[type]
    const phone = data.to?.phone_number
    if (!status || !phone) return

    try {
        const metadata = data.metadata ?? {}
        await captureServer(
            await distinctIdFor(admin, phone, text(metadata.user_id)),
            'phone_verification_delivery',
            {
                status,
                channel: text(data.channel),
                // A failed verification always says `undeliverable`: what failed is in its last attempt.
                reason: text(status === 'failed' ? data.last_attempt_reason : data.reason),
                country: countryOfE164(phone),
                context: text(metadata.context),
            },
            webhookId ? { uuid: deterministicUuid(`bird:${webhookId}`) } : undefined
        )
    } catch (error) {
        console.error('[phone-delivery] event not recorded', type, error)
    }
}
