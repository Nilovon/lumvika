import 'server-only'

import type { Json } from '@/app/api/database.types'
import { mergeNotificationPrefs, normalizeNotificationPrefs, type NotificationPrefs, type NotificationPrefsPatch } from '@/lib/notifications/prefs'
import { selectMaybeSingle, serviceScope, updateRows } from '@/lib/db'

export async function readNotificationPrefs(userId: string): Promise<NotificationPrefs> {
    const { data } = await selectMaybeSingle(serviceScope(), 'users', ['email_notification_prefs'] as const, { id: userId })
    return normalizeNotificationPrefs(data?.email_notification_prefs)
}

// Read the user's current jsonb prefs, apply the partial patch on top, and write back the full
// object. Reading first (rather than trusting the client to send every key) keeps a surface that only
// toggles one field from clobbering the rest.
export async function patchNotificationPrefs(userId: string, patch: NotificationPrefsPatch): Promise<NotificationPrefs> {
    const merged = mergeNotificationPrefs(await readNotificationPrefs(userId), patch)
    const { error } = await updateRows(serviceScope(), 'users', { email_notification_prefs: merged as unknown as Json }, { id: userId })
    if (error) throw new Error(error.message)
    return merged
}
