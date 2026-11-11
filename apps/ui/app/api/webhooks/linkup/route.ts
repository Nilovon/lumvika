import { claimDelivery, connectionForAccount, handleLinkupEnvelope, markDeliveryProcessed, releaseDelivery } from '@/lib/apps/inbound'
import { eventIdOf, parseEnvelope, verifyLinkupSignature } from '@/lib/apps/linkup/envelope'
import { serviceScope } from '@/lib/db'

// Linkup's deliveries for every account a paid app connected: messages, invitations, sign-outs. Each
// webhook is signed with a secret of its own, stored on its connection, so the account is looked up
// before the signature can be checked. Linkup retries on a 5xx and gives up on any other 4xx, so a
// delivery we cannot place is answered 2xx and left to the daily reconciliation.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
    const rawBody = await req.text()
    const envelope = parseEnvelope(rawBody)
    if (!envelope) return Response.json({ error: 'Not a Linkup event' }, { status: 400 })

    const scope = serviceScope()
    const connection = await connectionForAccount(scope, envelope.account_id)
    if (!connection?.provider_webhook_secret) return Response.json({ ignored: true })

    const signed = verifyLinkupSignature(connection.provider_webhook_secret, req.headers.get('x-linkup-timestamp') ?? '', req.headers.get('x-linkup-signature') ?? '', rawBody, Math.floor(Date.now() / 1000))
    if (!signed) return Response.json({ error: 'Invalid signature' }, { status: 401 })

    const eventId = eventIdOf(envelope, rawBody, req.headers.get('x-linkup-event-id'))
    if (!(await claimDelivery(scope, eventId, connection.app_slug))) return Response.json({ duplicate: true })

    try {
        await handleLinkupEnvelope(scope, connection, envelope)
        await markDeliveryProcessed(scope, eventId)
        return Response.json({ ok: true })
    } catch (err) {
        console.error(`[webhooks:linkup] ${eventId} failed`, err)
        await releaseDelivery(scope, eventId)
        return Response.json({ error: 'Retry later' }, { status: 500 })
    }
}
