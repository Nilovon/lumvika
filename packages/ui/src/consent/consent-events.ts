// A CustomEvent rather than a React context: the footer link that reopens the banner sits far from
// it in the tree, and a provider would force `Footer.tsx` to become a client component.
export const COOKIE_SETTINGS_EVENT = 'rerun:cookie-settings'

export function openCookieSettings() {
    window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT))
}
