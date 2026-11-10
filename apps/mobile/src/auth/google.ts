import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin'

import { SignInError } from '@/auth/sign-in'
import { supabase } from '@/auth/supabase'

// The iOS client of the Google project the web signs in with. Supabase lists it among the client ids
// it accepts, and skips the nonce check, which the native sheet does not carry.
const IOS_CLIENT_ID = '530380179314-likpnhr06isv0ucqs86c4bgpt0oi91c5.apps.googleusercontent.com'

GoogleSignin.configure({ iosClientId: IOS_CLIENT_ID })

const FAILED = 'We could not sign you in with Google. Try again.'

// Resolves false when the person closed the Google sheet: nothing to show then.
export async function signInWithGoogle(): Promise<boolean> {
    let idToken: string | null
    try {
        const response = await GoogleSignin.signIn()
        if (!isSuccessResponse(response)) return false
        idToken = response.data.idToken
    } catch (error) {
        if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) return false
        throw new SignInError(FAILED, 'google')
    }
    if (!idToken) throw new SignInError(FAILED, 'google')

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
    if (error) throw new SignInError(FAILED, 'google')
    return true
}

// Forgets the Google account picked, so the next sign-in asks again instead of reusing it silently.
export async function forgetGoogleAccount() {
    await GoogleSignin.signOut().catch(() => {})
}
