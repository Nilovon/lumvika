import type { DbScope } from '@/lib/db'
import { sendWhatsAppTemplate } from './client'
import { loadWhatsAppRecipient } from './recipient'
import { applyWhatsAppFailure, claimWhatsAppMessage, markWhatsAppMessageAccepted, releaseWhatsAppMessage } from './store'
import type { WhatsAppLanguage, WhatsAppMessage } from './templates'

export type DeliverWhatsAppInput = {
    userId: string
    workspaceId?: number | null
    agentId?: string | null
    message: WhatsAppMessage
    language: WhatsAppLanguage
    // Two deliveries under the same key are one message: the second is refused as a duplicate.
    dedupeKey?: string | null
}

export type DeliverWhatsAppResult = { sent: true; id: string } | { sent: false; reason: string }

// The id of our own row rides on the message, and comes back on every event Bird reports about it.
export const MESSAGE_ID_METADATA = 'message_id'

/**
 * The one way a WhatsApp message leaves Lumvika. A `sent` answer means Bird accepted it, nothing
 * more: whether it reached the phone is written on the row later, by the webhook.
 */
export async function deliverWhatsApp(scope: DbScope, input: DeliverWhatsAppInput): Promise<DeliverWhatsAppResult> {
    const recipient = await loadWhatsAppRecipient(scope, input.userId, input.message.category)
    if (!recipient.ok) return { sent: false, reason: recipient.reason }

    const claim = await claimWhatsAppMessage(scope, {
        userId: input.userId,
        workspaceId: input.workspaceId ?? null,
        agentId: input.agentId ?? null,
        phone: recipient.phone,
        message: input.message,
        language: input.language,
        dedupeKey: input.dedupeKey ?? null,
    })
    if (claim.outcome !== 'claimed') return { sent: false, reason: claim.outcome === 'duplicate' ? 'duplicate' : 'record_failed' }

    const result = await sendWhatsAppTemplate({
        to: recipient.phone,
        slug: input.message.slug,
        language: input.language,
        components: input.message.components,
        idempotencyKey: `whatsapp:${claim.id}`,
        tags: [{ name: 'template', value: input.message.key }],
        metadata: { [MESSAGE_ID_METADATA]: claim.id },
    })

    if (result.ok && result.id) {
        await markWhatsAppMessageAccepted(scope, claim.id, result.id)
        return { sent: true, id: claim.id }
    }

    // Nothing left in either case, so the row and its dedupe key are given back for a later try.
    if (result.ok || result.error === 'rate_limited') {
        await releaseWhatsAppMessage(scope, claim.id)
        return { sent: false, reason: result.ok ? 'delivery_disabled' : 'rate_limited' }
    }

    await applyWhatsAppFailure(scope, claim.id, { status: 'rejected', at: new Date().toISOString(), code: result.error, metaCode: null, description: result.detail })
    return { sent: false, reason: result.error }
}
