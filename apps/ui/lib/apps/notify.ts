// No 'server-only': the archive, restore and trial sweeps that call this run as Trigger.dev tasks.
import * as React from 'react'
import { AgentNotification, renderEmail } from '@lumvika/emails'
import { emailTranslator } from '@lumvika/emails/i18n'
import { APP_URL, REPLY_TO, TRANSACTIONAL_FROM, getResendClient, redirectDelivery } from '@/lib/email/client'
import { sendThrottled } from '@/lib/email/throttle'
import { buildUnsubscribeUrl, listUnsubscribeHeaders } from '@/lib/email/unsubscribeToken'
import { loadRecipient } from '@/lib/notifications/recipient'
import { recipientLocale } from '@/lib/i18n/recipient-locale'
import { translatorFor } from '@/lib/i18n/server-translator'
import { noticeText, type NoticeCopy } from '@/lib/notifications/notice-copy'
import { wantsCategoryEmail } from '@/lib/notifications/prefs'
import { insertRows, selectMany, type DbScope } from '@/lib/db'

export const APP_NOTICE_EVENT = 'app_notice'

export type AppNotice = {
    appName: string
    message: string
    copy: NoticeCopy
    // Who hears about it by email on top of the bell: a fact that costs money or stops the coworkers
    // is worth an email, a reconnect reminder after a restore is not.
    email: boolean
}

// The bell for the whole workspace, and an email to the members who keep billing emails on. Never
// throws: a notice that fails must not undo the change it reports.
export async function notifyWorkspace(scope: DbScope, workspaceId: number, notice: AppNotice): Promise<void> {
    try {
        const { error } = await insertRows(scope, 'notifications', {
            workspace_id: workspaceId,
            space_id: null,
            agent_id: null,
            engine_agent_id: null,
            event: APP_NOTICE_EVENT,
            kind: 'connector',
            message: notice.message,
            metadata: { app: notice.appName, notice: notice.copy },
            notified_at: new Date().toISOString(),
        })
        if (error) throw new Error(error.message)
        if (notice.email) await emailMembers(scope, workspaceId, notice)
    } catch (err) {
        console.error(`[apps] notice to workspace ${workspaceId} failed`, err)
    }
}

async function emailMembers(scope: DbScope, workspaceId: number, notice: AppNotice): Promise<void> {
    const resend = getResendClient()
    if (!resend) return

    const { data: admins } = await selectMany(scope, 'workspace_members', ['user_id'] as const, { workspace_id: workspaceId, role: 'admin' })
    const userIds = (admins ?? []).map(admin => admin.user_id)
    if (userIds.length === 0) return
    const { data: users } = await selectMany(scope, 'users', ['id', 'email_notification_prefs'] as const, { id: userIds })
    const recipients = (users ?? []).filter(user => wantsCategoryEmail(user.email_notification_prefs, 'billing'))

    await Promise.allSettled(
        recipients.map(async user => {
            const recipient = await loadRecipient(scope, user.id)
            if (!recipient) return
            const locale = await recipientLocale(scope, user.id, workspaceId)
            const unsubscribeUrl = buildUnsubscribeUrl(user.id)
            const subject = emailTranslator(locale)('subjects.appNotice', { appName: notice.appName })
            const message = noticeText({ message: notice.message, metadata: { notice: notice.copy } }, await translatorFor(locale, 'notifications.notices'))
            const { html, text } = await renderEmail(React.createElement(AgentNotification, { agentName: notice.appName, kind: 'connector', message, appUrl: APP_URL, unsubscribeUrl, locale }))
            const delivery = redirectDelivery(recipient.email, subject)
            await sendThrottled(() => resend.emails.send({ from: TRANSACTIONAL_FROM, replyTo: REPLY_TO, to: delivery.to, subject: delivery.subject, html, text, headers: listUnsubscribeHeaders(unsubscribeUrl) }))
        }),
    )
}
