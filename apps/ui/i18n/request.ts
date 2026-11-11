import { requestLocale, requestTimeZone } from '@/lib/i18n/request-locale'
import { cloudMessages } from '@lumvika/cloud/messages'
import type { AppLocale } from '@lumvika/i18n'
import { loadMessages, type Messages } from '@lumvika/i18n/messages'
import { getRequestConfig } from 'next-intl/server'

// The packs of the other surfaces (the landing, the iOS app, the emails and the pushes the server
// writes) never render here: kept out, they stay out of every page the app sends to the browser.
const OTHER_SURFACES = /^(landing|mobile|emails$|push$)/

const messagesByLocale = new Map<AppLocale, Promise<Messages>>()

function appMessages(locale: AppLocale): Promise<Messages> {
    const cached = messagesByLocale.get(locale)
    if (cached) return cached
    const loading = cloudMessages(locale)
        .then(extra => loadMessages(locale, [extra]))
        .then(all => Object.fromEntries(Object.entries(all).filter(([namespace]) => !OTHER_SURFACES.test(namespace))) as Messages)
    loading.catch(() => messagesByLocale.delete(locale))
    messagesByLocale.set(locale, loading)
    return loading
}

export default getRequestConfig(async () => {
    const locale = await requestLocale()
    const [messages, timeZone] = await Promise.all([appMessages(locale), requestTimeZone()])
    return { locale, messages, timeZone }
})
