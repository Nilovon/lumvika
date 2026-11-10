import type { Locale } from '@lumvika/i18n'

import type { MobileMessages } from '@/i18n/messages'

declare module 'use-intl' {
    interface AppConfig {
        Locale: Locale
        Messages: MobileMessages
    }
}
