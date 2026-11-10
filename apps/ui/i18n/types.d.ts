import type { AppLocale } from '@lumvika/i18n'
import type { Messages } from '@lumvika/i18n/messages'

declare module 'next-intl' {
    interface AppConfig {
        Locale: AppLocale
        Messages: Messages
    }
}
