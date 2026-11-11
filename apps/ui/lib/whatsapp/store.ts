import type { Database } from '@/app/api/database.types'
import { deleteRows, insertRow, selectMaybeSingle, updateRows, type DbScope } from '@/lib/db'
import type { WhatsAppLanguage, WhatsAppMessage } from './templates'

type MessageUpdate = Database['public']['Tables']['whatsapp_messages']['Update']

// A conflict on dedupe_key means this message already left, or is leaving: the unique index doing
// its job, not a failure.
const UNIQUE_VIOLATION = '23505'

const PROGRESS = ['pending', 'accepted', 'sent', 'delivered', 'read'] as const
export type WhatsAppProgress = Exclude<(typeof PROGRESS)[number], 'pending' | 'accepted'>
export type WhatsAppFailureStatus = 'failed' | 'rejected'

const PROGRESS_DATE = { sent: 'sent_at', delivered: 'delivered_at', read: 'read_at' } as const satisfies Record<WhatsAppProgress, keyof MessageUpdate>

// A failure reported once the message reached the phone would be a contradiction, so it only lands
// on a message still on its way.
const FAILABLE = ['pending', 'accepted', 'sent']

const OWNER_COLUMNS = ['user_id', 'phone'] as const

export type ClaimInput = {
    userId: string
    workspaceId: number | null
    agentId: string | null
    phone: string
    message: Pick<WhatsAppMessage, 'key' | 'category'>
    language: WhatsAppLanguage
    dedupeKey: string | null
}

export type ClaimOutcome = { outcome: 'claimed'; id: string } | { outcome: 'duplicate' } | { outcome: 'failed' }

// The row is written before the send: its id is the idempotency key Bird sees and the reference the
// webhook brings back, so both have to exist before anything leaves.
export async function claimWhatsAppMessage(scope: DbScope, input: ClaimInput): Promise<ClaimOutcome> {
    const { data, error } = await insertRow(
        scope,
        'whatsapp_messages',
        {
            user_id: input.userId,
            workspace_id: input.workspaceId,
            agent_id: input.agentId,
            phone: input.phone,
            template_key: input.message.key,
            language: input.language,
            category: input.message.category,
            dedupe_key: input.dedupeKey,
        },
        ['id']
    )

    if (data) return { outcome: 'claimed', id: data.id }
    if (error?.code === UNIQUE_VIOLATION) return { outcome: 'duplicate' }
    console.error('[whatsapp] failed to record a message', error?.message)
    return { outcome: 'failed' }
}

// For a message that never left and may be tried again: its dedupe key is given back.
export async function releaseWhatsAppMessage(scope: DbScope, id: string): Promise<void> {
    const { error } = await deleteRows(scope, 'whatsapp_messages', { id })
    if (error) console.error('[whatsapp] failed to release a message', error.message)
}

async function advance(scope: DbScope, id: string, status: (typeof PROGRESS)[number]): Promise<boolean> {
    const behind = PROGRESS.slice(0, PROGRESS.indexOf(status))
    const { error } = await updateRows(scope, 'whatsapp_messages', { status }, { id, status: [...behind] })
    if (error) console.error('[whatsapp] failed to advance a message', error.message)
    return !error
}

// The webhook can outrun this write, so the status only moves when the message is still pending.
export async function markWhatsAppMessageAccepted(scope: DbScope, id: string, birdMessageId: string): Promise<void> {
    const { error } = await updateRows(scope, 'whatsapp_messages', { bird_message_id: birdMessageId }, { id })
    if (error) console.error('[whatsapp] failed to keep a Bird id', error.message)
    await advance(scope, id, 'accepted')
}

// Bird delivers its events out of order: each one writes its own date, and the status never steps
// back from a later one.
export async function applyWhatsAppProgress(scope: DbScope, id: string, event: { status: WhatsAppProgress; at: string; birdMessageId: string }): Promise<boolean> {
    const { error } = await updateRows(scope, 'whatsapp_messages', { [PROGRESS_DATE[event.status]]: event.at, bird_message_id: event.birdMessageId }, { id })
    if (error) {
        console.error('[whatsapp] failed to date a message', error.message)
        return false
    }
    return advance(scope, id, event.status)
}

export type WhatsAppFailure = { status: WhatsAppFailureStatus; at: string; code: string | null; metaCode: string | null; description: string | null }

export async function applyWhatsAppFailure(scope: DbScope, id: string, failure: WhatsAppFailure): Promise<boolean> {
    const { error } = await updateRows(scope, 'whatsapp_messages', { status: failure.status, failed_at: failure.at, error_code: failure.code, meta_error_code: failure.metaCode, error: failure.description }, { id, status: FAILABLE })
    if (error) console.error('[whatsapp] failed to record a failure', error.message)
    return !error
}

export async function loadWhatsAppMessageOwner(scope: DbScope, id: string): Promise<{ user_id: string; phone: string } | null> {
    const { data } = await selectMaybeSingle(scope, 'whatsapp_messages', OWNER_COLUMNS, { id })
    return data
}
