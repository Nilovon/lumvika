import { defineQuotas, type QuotaLimit } from '@/lib/apps/quotas'

// What one WhatsApp number may send through its coworkers. WhatsApp bans a number for unsolicited
// messages far faster than LinkedIn restricts a profile: a first message to somebody counts twice,
// once as a message and once as a new conversation, the limit that matters.

export type QuotaAction = 'message' | 'new_conversation' | 'number_check' | 'attachment_download'

const DEFAULT_QUOTAS: Record<QuotaAction, QuotaLimit[]> = {
    message: [{ window: 'day', max: 100 }],
    new_conversation: [{ window: 'day', max: 20 }],
    number_check: [{ window: 'day', max: 500 }],
    attachment_download: [{ window: 'day', max: 200 }],
}

const QUOTA_NOUNS: Record<QuotaAction, string> = {
    message: 'message',
    new_conversation: 'new conversation',
    number_check: 'number check',
    attachment_download: 'attachment download',
}

export const { quotaLimits, quotaClaim, quotaRefusal } = defineQuotas<QuotaAction>({
    envPrefix: 'WHATSAPP_QUOTA',
    limits: DEFAULT_QUOTAS,
    nouns: QUOTA_NOUNS,
    refusal: (noun, windows) =>
        `The ${noun} limit of this WhatsApp number is reached (${windows}). It protects the number from a WhatsApp ban. Do not retry today: tell the user and pick the work up again tomorrow.`,
})
