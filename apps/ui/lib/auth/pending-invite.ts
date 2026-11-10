export const PENDING_INVITE_COOKIE = 'pending_invite'

export function writePendingInviteCookie(value: string): void {
    document.cookie = `${PENDING_INVITE_COOKIE}=${value}; path=/; max-age=1800; samesite=lax`
}
