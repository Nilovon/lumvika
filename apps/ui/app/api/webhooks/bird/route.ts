import { Webhook } from 'standardwebhooks'
import { serviceScope, type DbScope } from '@/lib/db'
import { markWhatsAppReplied, markWhatsAppUnreachable, setWhatsAppOptOut } from '@/lib/whatsapp/recipient'
import { MESSAGE_ID_METADATA } from '@/lib/whatsapp/send'
import { applyWhatsAppFailure, applyWhatsAppProgress, loadWhatsAppMessageOwner, type WhatsAppFailureStatus, type WhatsAppProgress } from '@/lib/whatsapp/store'

type Address = { phone_number?: string | null }

type MessageData = {
    direction?: string
    whatsapp_id?: string
    from?: Address | null
    to?: Address | null
    metadata?: Record<string, unknown> | null
    error?: { code?: string | null; description?: string | null; meta_error_code?: string | null; occurred_at?: string | null } | null
}

type PreferenceData = { channel?: string; handle?: string }
type SuppressionData = { address?: string }

type BirdEvent = { type: string; timestamp: string; data?: MessageData & PreferenceData & SuppressionData }

const PROGRESS_EVENTS: Record<string, WhatsAppProgress> = { 'whatsapp.sent': 'sent', 'whatsapp.delivered': 'delivered', 'whatsapp.read': 'read' }
const FAILURE_EVENTS: Record<string, WhatsAppFailureStatus> = { 'whatsapp.failed': 'failed', 'whatsapp.rejected': 'rejected' }

// Meta's own codes, the two that say something lasting about the number rather than the message.
const META_UNDELIVERABLE = '131026'
const META_MARKETING_STOPPED = '131050'

// Only a message deliverWhatsApp sent carries our row id: a one-time passcode, or anything sent
// from the Bird dashboard, is not ours to track.
function trackedMessageId(data: MessageData): string | null {
    const id = data.metadata?.[MESSAGE_ID_METADATA]
    return data.direction === 'outbound' && typeof id === 'string' ? id : null
}

// On staging every message is redirected to one phone, so a failure there says nothing about the
// number the message was meant for.
async function flagFailedNumber(scope: DbScope, messageId: string, data: MessageData, at: string): Promise<boolean> {
    const metaCode = data.error?.meta_error_code
    if (metaCode !== META_UNDELIVERABLE && metaCode !== META_MARKETING_STOPPED) return true

    const owner = await loadWhatsAppMessageOwner(scope, messageId)
    if (!owner || owner.phone !== data.to?.phone_number) return true

    return metaCode === META_UNDELIVERABLE ? markWhatsAppUnreachable(scope, owner.phone, at) : setWhatsAppOptOut(scope, owner.phone, at)
}

async function handle(scope: DbScope, event: BirdEvent): Promise<boolean> {
    // Bird's own test delivery is a stub that carries a type and nothing else.
    const { type, timestamp, data = {} } = event

    const progress = PROGRESS_EVENTS[type]
    const failure = FAILURE_EVENTS[type]
    if (progress || failure) {
        const messageId = trackedMessageId(data)
        if (!messageId) return true
        if (progress) return applyWhatsAppProgress(scope, messageId, { status: progress, at: timestamp, birdMessageId: data.whatsapp_id ?? '' })

        const at = data.error?.occurred_at ?? timestamp
        const recorded = await applyWhatsAppFailure(scope, messageId, {
            status: failure,
            at,
            code: data.error?.code ?? null,
            metaCode: data.error?.meta_error_code ?? null,
            description: data.error?.description ?? null,
        })
        return recorded && flagFailedNumber(scope, messageId, data, at)
    }

    if (type === 'whatsapp.received') {
        const phone = data.direction === 'inbound' ? data.from?.phone_number : null
        return phone ? markWhatsAppReplied(scope, phone, timestamp) : true
    }

    // A STOP typed in the chat and Meta's "stop marketing" both arrive as a revoked preference.
    if ((type === 'preference.revoked' || type === 'preference.granted') && data.channel === 'whatsapp' && data.handle) {
        return setWhatsAppOptOut(scope, data.handle, type === 'preference.revoked' ? timestamp : null)
    }
    if (type === 'whatsapp_suppression.created' && data.address) return setWhatsAppOptOut(scope, data.address, timestamp)

    return true
}

// Bird's events for the WhatsApp messages Lumvika sends: what became of each one, who said stop and
// who answered.
// Anything but a 2xx is retried by Bird for about a day, which is what a refused signature and a
// failed write both want.
export async function POST(req: Request) {
    const secret = process.env.BIRD_WEBHOOK_SECRET
    if (!secret) return Response.json({ error: 'BIRD_WEBHOOK_SECRET is not set' }, { status: 500 })

    let event: BirdEvent
    try {
        event = new Webhook(secret).verify(await req.text(), Object.fromEntries(req.headers)) as BirdEvent
    } catch {
        return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const handled = await handle(serviceScope(), event)
    return handled ? Response.json({ received: true }) : Response.json({ error: 'Write failed' }, { status: 500 })
}
