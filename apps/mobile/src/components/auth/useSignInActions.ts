import { useState } from 'react'
import { useTranslations } from 'use-intl'

import { useSignInFlow } from '@/components/auth/SignInFlow'
import { signInWithApple } from '@/auth/apple'
import { signInWithGoogle } from '@/auth/google'
import { sendEmailCode, SignInError } from '@/auth/sign-in'
import { track } from '@/lib/analytics'

const REASON_KEYS = { network: 'errors.offline', session: 'errors.session', apple: 'errors.apple', google: 'errors.google' } as const

// The sentence of a failed sign-in in the app's language. A refusal of the hub the app has no sentence
// for yet keeps the hub's own words.
export function useSignInErrorText(): (failure: unknown) => string {
    const t = useTranslations('mobileAuth')
    return failure => {
        if (!(failure instanceof SignInError)) return t('errors.generic')
        if (Object.hasOwn(REASON_KEYS, failure.reason)) return t(REASON_KEYS[failure.reason as keyof typeof REASON_KEYS])
        if (!failure.method) return failure.message
        const key = `errors.${failure.method}.${failure.reason}` as Parameters<typeof t>[0]
        return t.has(key) ? t(key) : failure.message
    }
}

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

export function useEmailCode() {
    const { email, goTo, setThinking } = useSignInFlow()
    const t = useTranslations('mobileAuth')
    const errorText = useSignInErrorText()
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const send = async () => {
        if (!looksLikeEmail(email)) return setError(t('errors.email.invalid_email'))
        track('signup_method_selected', { method: 'email' })
        setSending(true)
        setThinking(true)
        setError(null)
        try {
            await sendEmailCode(email.trim())
            goTo({ name: 'code', method: 'email' })
        } catch (failure) {
            setError(errorText(failure))
        } finally {
            setSending(false)
            setThinking(false)
        }
    }

    return { send, sending, error, clearError: () => setError(null) }
}

// Once the session opens, the root layout swaps the sign-in screens for the app on its own.
export function useOAuthSignIn() {
    const { setThinking } = useSignInFlow()
    const errorText = useSignInErrorText()
    const [signingIn, setSigningIn] = useState<'apple' | 'google' | null>(null)
    const [error, setError] = useState<string | null>(null)

    const continueWith = async (method: 'apple' | 'google') => {
        if (signingIn) return
        track('signup_method_selected', { method })
        setSigningIn(method)
        setThinking(true)
        setError(null)
        try {
            await (method === 'apple' ? signInWithApple() : signInWithGoogle())
        } catch (failure) {
            setError(errorText(failure))
        } finally {
            setSigningIn(null)
            setThinking(false)
        }
    }

    return { continueWith, signingIn, error }
}
