// A self-hosted install sends from its own verified domain: RESEND_FROM, RESEND_MARKETING_FROM,
// RESEND_EXPERTS_FROM and RESEND_REPLY_TO. Until they are set, Resend's shared test sender, which only
// delivers to the address of the Resend account itself.
const RESEND_TEST_SENDER = 'Lumvika <onboarding@resend.dev>'

export const DEFAULT_SENDERS: { transactional: string; experts: string; marketing: string; replyTo: string | undefined } = {
    transactional: RESEND_TEST_SENDER,
    experts: RESEND_TEST_SENDER,
    marketing: RESEND_TEST_SENDER,
    replyTo: undefined,
}

// WhatsApp templates name the number they are sent from, a number of the install's own WhatsApp
// Business Account: BIRD_WHATSAPP_FROM.
export const DEFAULT_WHATSAPP_FROM: string | null = null
