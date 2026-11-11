// No 'server-only': the lifecycle and billing emails that call this are sent from Trigger.dev tasks.
import { I18N_RELEASED } from '@/lib/features'
import { selectMaybeSingle, type DbScope } from '@/lib/db'
import { DEFAULT_LOCALE, isStableLocale, type Locale } from '@lumvika/i18n'

// The language a push, an email or a message sent to someone is written in, outside any request of
// theirs: the one their account picked, else their workspace's. An account can only pick one once
// the packs reach it, so before I18N_RELEASED only those accounts leave English.
export async function recipientLocale(scope: DbScope, userId: string, workspaceId: number | null): Promise<Locale> {
    const { data: user } = await selectMaybeSingle(scope, 'users', ['locale'] as const, { id: userId })
    if (isStableLocale(user?.locale)) return user.locale
    return workspaceId === null ? DEFAULT_LOCALE : workspaceLocale(scope, workspaceId)
}

// For someone the workspace writes to without an account of their own yet: an invitee, a visitor
// of a published page.
export async function workspaceLocale(scope: DbScope, workspaceId: number): Promise<Locale> {
    if (!I18N_RELEASED) return DEFAULT_LOCALE
    const { data: workspace } = await selectMaybeSingle(scope, 'workspaces', ['locale'] as const, { id: workspaceId })
    return isStableLocale(workspace?.locale) ? workspace.locale : DEFAULT_LOCALE
}
