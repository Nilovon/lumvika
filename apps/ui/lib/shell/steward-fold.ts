export const STEWARD_FOLD_STORAGE_KEY = 'lumvika:steward-fold'
export const STEWARD_FOLD_COOKIE = 'lumvika-steward-fold'
const STEWARD_FOLD_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

// Whether the pages (the board aside) fold the docked Steward column behind its orb, as last
// measured in this browser: the window was between `md` and the width where the column still leaves
// the page room. The server cannot measure the window, so it renders the last answer and the first
// paint matches the last visit instead of docking the column for a moment.
export function parseStewardFolds(value: string | null | undefined): boolean | null {
    if (value === 'fold') return true
    if (value === 'dock') return false
    return null
}

// Same mount as the sidebar (lib/shell/sidebar-state): localStorage and the cookie the server reads.
export function rememberStewardFolds(folds: boolean): void {
    const value = folds ? 'fold' : 'dock'
    try {
        if (localStorage.getItem(STEWARD_FOLD_STORAGE_KEY) === value && document.cookie.includes(`${STEWARD_FOLD_COOKIE}=${value}`)) return
        localStorage.setItem(STEWARD_FOLD_STORAGE_KEY, value)
    } catch {}
    const parts = [`${STEWARD_FOLD_COOKIE}=${value}`, 'path=/', `max-age=${STEWARD_FOLD_COOKIE_MAX_AGE}`, 'SameSite=Lax']
    if (window.location.protocol === 'https:') parts.push('Secure')
    document.cookie = parts.join('; ')
}
