import { NextResponse } from 'next/server'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import { EMAIL_CATEGORIES, normalizeNotificationPrefs, type EmailCategory } from '@/lib/notifications/prefs'
import { selectSingle, serviceScope, updateRows, type TablesUpdate } from '@/lib/db'

type UserUpdate = TablesUpdate<'users'>

function isCategory(value: string | null): value is EmailCategory {
    return value !== null && (EMAIL_CATEGORIES as readonly string[]).includes(value)
}

// One-click unsubscribe endpoint for the RFC 8058 `List-Unsubscribe-Post` header. A token scoped to
// `runs` turns off the agent notification emails, which is what the link at the bottom of a run
// email promises; an unscoped one turns off the given account category, or all of them.
export async function POST(request: Request): Promise<NextResponse> {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    if (!token) return NextResponse.json({ ok: false }, { status: 400 })

    const target = verifyUnsubscribeToken(token)
    if (!target) return NextResponse.json({ ok: false }, { status: 400 })

    const categoryParam = url.searchParams.get('category')
    const categories: EmailCategory[] = isCategory(categoryParam) ? [categoryParam] : [...EMAIL_CATEGORIES]

    const scope = serviceScope()
    const { data: current } = await selectSingle(scope, 'users', ['email_notification_prefs'] as const, { id: target.userId })
    const prefs = normalizeNotificationPrefs(current?.email_notification_prefs)
    let merged = prefs
    if (target.scope === 'runs') {
        merged = { ...prefs, email: false }
    } else {
        for (const category of categories) merged.categories[category] = false
    }

    const { error } = await updateRows(scope, 'users', { email_notification_prefs: merged as unknown as UserUpdate['email_notification_prefs'] }, { id: target.userId })
    if (error) return NextResponse.json({ ok: false }, { status: 500 })

    return NextResponse.json({ ok: true })
}
