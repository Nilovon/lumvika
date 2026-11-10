import type { AppLocale, MessageTree } from '@lumvika/i18n'

// The strings of Lumvika Cloud's own screens, merged over the app's packs. A self-hosted install has none.
export async function cloudMessages(_locale: AppLocale): Promise<MessageTree> {
    return {}
}
