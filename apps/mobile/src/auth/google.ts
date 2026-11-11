import { APP_SCHEME, authClient } from '@/auth/auth-client'
import { SignInError } from '@/auth/sign-in'

const FAILED = 'We could not sign you in with Google. Try again.'

// Google's page opens in an auth session that comes back to the app; Better Auth's Expo client keeps
// the cookie it brings. Resolves false when the person closed the page without signing in.
export async function signInWithGoogle(): Promise<boolean> {
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: `${APP_SCHEME}://` })
    if (error) throw new SignInError(FAILED, 'google')

    const { data, error: sessionError } = await authClient.getSession()
    if (sessionError) throw new SignInError(FAILED, 'google')
    return data !== null
}
