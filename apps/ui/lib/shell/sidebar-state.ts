export const SIDEBAR_STORAGE_KEY = 'lumvika:sidebar'
export const SIDEBAR_COOKIE = 'lumvika-sidebar'
const SIDEBAR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

export function parseSidebarCollapsed(value: string | null | undefined): boolean | null {
    if (value === 'collapsed') return true
    if (value === 'expanded') return false
    return null
}

export function loadSidebarCollapsed(): boolean | null {
    try {
        return parseSidebarCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY))
    } catch {
        return null
    }
}

/**
 * Same mount as the Steward column (lib/steward-open): localStorage holds the preference, the cookie
 * mirrors it so the server renders the sidebar at its width and nothing slides on load.
 */
export function rememberSidebarCollapsed(collapsed: boolean): void {
    const value = collapsed ? 'collapsed' : 'expanded'
    try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, value)
    } catch {}
    const parts = [`${SIDEBAR_COOKIE}=${value}`, 'path=/', `max-age=${SIDEBAR_COOKIE_MAX_AGE}`, 'SameSite=Lax']
    if (window.location.protocol === 'https:') parts.push('Secure')
    document.cookie = parts.join('; ')
}
