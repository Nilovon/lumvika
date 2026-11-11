import { isAppleRelayEmail, realEmail } from '@/lib/auth/placeholder-email'

export type UserProfile = { name: string | null; avatarUrl: string | null }

export const PROFILE_NAME_MAX = 80

// The name the anonymous plugin gives every visitor; it stays on the row once they claim an address.
const ANONYMOUS_NAME = 'Anonymous'

// The auth user as `auth.users` holds it. The name and the photo are the ones the person chose in
// their account, or the provider's until they do: a sign-in never writes over them again.
export type ProfileSource = { name: string | null; image: string | null }

export function readProfile(authUser: ProfileSource): UserProfile {
    const name = authUser.name?.trim()
    return {
        name: name && name !== ANONYMOUS_NAME ? name : null,
        avatarUrl: authUser.image?.trim() || null,
    }
}

// Someone who signed in by email code has no name anywhere: the part before the @ is the only
// thing that tells them apart from a teammate. An Apple relay address has nothing to show there.
export function displayNameOf(authUser: ProfileSource & { email: string | null }): string | null {
    const name = readProfile(authUser).name
    if (name) return name
    const email = realEmail(authUser.email)
    return email && !isAppleRelayEmail(email) ? email.split('@')[0] : null
}
