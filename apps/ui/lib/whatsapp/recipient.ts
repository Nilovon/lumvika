import type { DbScope } from '@/lib/db'
import type { WhatsAppCategory } from './templates'

export type WhatsAppRefusal = 'no_phone' | 'unverified' | 'no_consent' | 'opted_out' | 'unreachable' | 'unsupported_country' | 'marketing_paused'
export type WhatsAppRecipient = { ok: true; phone: string } | { ok: false; reason: WhatsAppRefusal }

// The last gate before a message is built. Lumvika keeps no verified phone number for anyone, so no
// one can be written to on WhatsApp.
export async function loadWhatsAppRecipient(_scope: DbScope, _userId: string, _category: WhatsAppCategory): Promise<WhatsAppRecipient> {
    return { ok: false, reason: 'no_phone' }
}

// Bird reports on numbers Lumvika keeps nothing about, so each flag is taken as handled: answering
// otherwise would have Bird send the same event again forever.
export async function setWhatsAppOptOut(_scope: DbScope, _phone: string, _optedOutAt: string | null): Promise<boolean> {
    return true
}

export async function markWhatsAppUnreachable(_scope: DbScope, _phone: string, _at: string): Promise<boolean> {
    return true
}

export async function markWhatsAppReplied(_scope: DbScope, _phone: string, _at: string): Promise<boolean> {
    return true
}
