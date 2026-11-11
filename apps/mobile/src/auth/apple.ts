import * as AppleAuthentication from 'expo-apple-authentication'

import { authClient } from '@/auth/auth-client'
import { SignInError } from '@/auth/sign-in'

const FAILED = 'We could not sign you in with Apple. Try again.'

// Resolves false when the person closed the Apple sheet: nothing to show then.
export async function signInWithApple(): Promise<boolean> {
    let credential: AppleAuthentication.AppleAuthenticationCredential
    try {
        credential = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] })
    } catch (error) {
        if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false
        throw new SignInError(FAILED, 'apple')
    }
    if (!credential.identityToken) throw new SignInError(FAILED, 'apple')

    // Apple hands the name over on the very first sign-in only, and leaves it out of the token: sent
    // with it, or the account would never have one.
    const firstName = credential.fullName?.givenName ?? undefined
    const lastName = credential.fullName?.familyName ?? undefined
    const user = firstName || lastName ? { name: { firstName, lastName } } : undefined

    const { error } = await authClient.signIn.social({ provider: 'apple', idToken: { token: credential.identityToken, user } })
    if (error) throw new SignInError(FAILED, 'apple')
    return true
}
