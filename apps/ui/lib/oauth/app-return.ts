// Where an in-app sign-in ends. A constant, never a URL the caller supplied: the callback routes
// redirect to it, so anything read from the request would be an open redirect.
export const APP_RETURN_URL = 'rerun://oauth/callback'

// `claim` names the row the callback parked the sign-in on; the app finishes with it, authenticated.
export function appReturnUrl(result: { ok: true; claim?: string } | { ok: false; error: string }): string {
    const params = new URLSearchParams(result.ok ? { status: 'success', ...(result.claim ? { claim: result.claim } : {}) } : { status: 'error', message: result.error })
    return `${APP_RETURN_URL}?${params.toString()}`
}
