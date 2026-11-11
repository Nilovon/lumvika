// Deliberately no 'server-only' import: this module is pulled in both by email.service.ts (Next
// server) and by the Trigger.dev tasks that send scheduled expert invites, which are bundled
// outside the Next.js RSC pipeline and would crash on the server-only marker.
import { createTransport } from 'nodemailer'
import { Resend } from 'resend'

import { DEFAULT_SENDERS } from '@lumvika/cloud/senders'
import { APP_URL } from '@/lib/app-url'

export { APP_URL, notificationUrl } from '@/lib/app-url'

// The fallback has to be an address on a Resend-verified sending domain: a root domain without SPF
// nor a DKIM key 403s, and would land unauthenticated if it ever went out.
export const TRANSACTIONAL_FROM = process.env.RESEND_FROM ?? DEFAULT_SENDERS.transactional
// Expert invites ship from their own verified domain so cold outreach never touches the
// reputation of the transactional sender.
export const EXPERTS_FROM = process.env.RESEND_EXPERTS_FROM ?? DEFAULT_SENDERS.experts
// Re-engagement mail gets its own domain too. Nobody asked for a nudge, so it is where the
// complaints and the unsubscribes come from, and a complaint must never land on the domain that
// carries sign-in links, run failures and billing.
export const MARKETING_FROM = process.env.RESEND_MARKETING_FROM ?? DEFAULT_SENDERS.marketing
// The newsletter has a domain of its own so a bulk editorial send answers for itself, but an
// unconfigured environment falls back to the marketing sender rather than the transactional one: a
// blast is never worth putting sign-in delivery at stake.
export const NEWSLETTER_FROM = process.env.RESEND_NEWSLETTER_FROM ?? MARKETING_FROM
// Every sending subdomain has receiving disabled, so a reply to the `from` address bounces.
// Pointing it at a mailbox that exists is both what makes the emails answerable and one of the
// strongest positive signals a mailbox provider has: people reply to senders they trust.
export const REPLY_TO = process.env.RESEND_REPLY_TO ?? DEFAULT_SENDERS.replyTo

export type SendEmailResult = { ok: true; id: string | null; skipped?: boolean } | { ok: false; error: string }

// Staging runs on a clone of the production database, so every recipient is a real user. When
// EMAIL_REDIRECT_TO is set, the whole delivery is rerouted to that single inbox and the intended
// recipient is moved into the subject, which keeps the emails testable without ever reaching anyone.
export function redirectDelivery(to: string, subject: string): { to: string; subject: string } {
    const inbox = process.env.EMAIL_REDIRECT_TO
    if (!inbox) return { to, subject }
    return { to: inbox, subject: `[staging → ${to}] ${subject}` }
}

// Production and staging both run with NODE_ENV=production, so nothing in the runtime tells them
// apart. EMAIL_REDIRECT_TO does: it is set everywhere the
// recipients are a clone of the real users, and left unset only where they are the real users.
export const IS_PRODUCTION_MAILER = process.env.NODE_ENV === 'production' && !process.env.EMAIL_REDIRECT_TO

// The part of the Resend client the app sends with.
export type EmailSender = { emails: Pick<Resend['emails'], 'send'> }

let client: EmailSender | null = null

// Resend when RESEND_API_KEY is set. Without it, SMTP_URL (Mailpit under `pnpm db:start`) catches
// every email on this machine, so a sign-in code can be read in its inbox.
export function getResendClient(): EmailSender | null {
    if (client) return client
    const key = process.env.RESEND_API_KEY
    if (key) client = new Resend(key)
    else if (process.env.SMTP_URL) client = smtpSender(process.env.SMTP_URL)
    return client
}

function smtpSender(url: string): EmailSender {
    const transport = createTransport(url)
    const send: Resend['emails']['send'] = async payload => {
        const message = payload as { from: string; to: string | string[]; subject: string; html?: string; text?: string; replyTo?: string | string[]; headers?: Record<string, string> }
        try {
            const sent = await transport.sendMail({ from: message.from, to: message.to, subject: message.subject, html: message.html, text: message.text, replyTo: message.replyTo, headers: message.headers })
            return { data: { id: sent.messageId }, error: null, headers: null }
        } catch (cause) {
            return { data: null, error: { name: 'application_error', message: cause instanceof Error ? cause.message : String(cause), statusCode: null }, headers: null }
        }
    }
    return { emails: { send } }
}
