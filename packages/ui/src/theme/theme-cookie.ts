export const THEME_COOKIE = 'rerun-theme'

export const THEME_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

// Clé localStorage par défaut de next-themes : le bootstrap l'amorce avant que next-themes la lise.
export const THEME_STORAGE_KEY = 'theme'

export type ThemePreference = 'light' | 'dark' | 'system'

export function parseThemePreference(value: string | null | undefined): ThemePreference {
    return value === 'light' || value === 'dark' ? value : 'system'
}

// 'system' ne se résout que dans le navigateur : le serveur ne pose aucune classe et laisse
// le script bloquant de next-themes trancher avant le premier paint.
export function themeClass(preference: ThemePreference): string {
    return preference === 'dark' ? 'dark' : ''
}
