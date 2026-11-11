'use client'

import { useErrorText } from '@/hooks/useErrorText'
import { completeSignupAction, prepareAnonymousEmailStep } from '@/app/(authflow)/auth/actions'
import { AuthMethods } from '@/components/auth/AuthMethods'
import type { AuthMethod } from '@/lib/auth/auth-method'
import { AnonymousEmailStep } from '@/components/auth/AnonymousEmailStep'
import type { GetCaptchaToken } from '@/components/auth/captcha/captcha-error'
import { EmailSendError, trackEmailSend } from '@/components/auth/email-send'
import { OAuthSignInButton } from '@/components/auth/OAuthSignInButton'
import { useSignupFunnel } from '@/components/auth/useSignupFunnel'
import { authCall, authClient } from '@/lib/auth/auth-client'
import { rememberSignInMethod } from '@/lib/auth/last-sign-in'
import { signupStep } from '@/lib/auth/signup-abandon'
import { useOnboardingStore } from '@/stores/onboarding.store'
import { useOptionalSession } from '@/lib/auth/session/SessionProvider'
import { SIGNUP_INTENT_COOKIE, type SignupSurface } from '@lumvika/analytics'
import { setSharedCookie } from '@lumvika/analytics/client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ENABLED_OAUTH_PROVIDERS } from '@/lib/auth/oauth-providers'

const SETTLE_TIMEOUT_MS = 5_000

// How an anonymous visitor becomes an account, wherever the form is drawn: the account dialog and
// the arrival column mount the same thing. A brand-new email upgrades the anonymous user in place
// (an email change, confirmed by the code mailed to the new address); an existing email signs them
// into that account instead. Either way the parked draft is flagged for replay (markResume) and the board finishes
// the job once the session settles.
//
// `active` is whether the form is on screen: it is what opens and closes the signup the funnel counts.
export function useAnonymousSignUp({ surface, active, onEntered }: { surface: SignupSurface; active: boolean; onEntered?: (created: boolean) => void }): { form: ReactNode; abandon: () => void; reset: () => void; movedOn: boolean } {
    const t = useTranslations('auth')
    const [formKey, setFormKey] = useState(0)
    // Past the first screen: a method switched to, or a code asked for.
    const [movedOn, setMovedOn] = useState(false)
    const errorText = useErrorText()
    const router = useRouter()
    const refreshUser = useOptionalSession()?.refreshUser
    const markResume = useOnboardingStore(s => s.markResume)
    const emailIsNew = useRef(false)
    const funnel = useSignupFunnel({ surface, active, initialStep: 'email' })

    const reset = () => {
        funnel.setStep('email')
        setFormKey(k => k + 1)
        setMovedOn(false)
    }

    const sendCode = (email: string, getToken: GetCaptchaToken) =>
        trackEmailSend(async () => {
            const prepared = await prepareAnonymousEmailStep({ email, captcha: await getToken() })
            if (!prepared.ok) throw new EmailSendError(errorText(prepared), prepared.reason)
            const { exists } = prepared
            emailIsNew.current = !exists
            if (!exists) setSharedCookie(SIGNUP_INTENT_COOKIE, 'email', 1)
            if (exists) {
                await authCall(authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' }))
                return
            }
            // The address is claimed on the session in hand; one lost on the way is opened again.
            if (!(await authClient.getSession()).data) await authCall(authClient.signIn.anonymous())
            await authCall(authClient.emailOtp.requestEmailChange({ newEmail: email }))
        })

    // Existing account: sign in. The anonymous workspace is left behind; the parked draft is replayed
    // on the account the user just signed into. New account: the code confirms the email the anonymous
    // user claimed, so the workspace, and the agent about to be created, stay on the same id.
    const verifyCode = async (email: string, code: string) => {
        if (emailIsNew.current) await authCall(authClient.emailOtp.changeEmail({ newEmail: email, otp: code }))
        else await authCall(authClient.signIn.emailOtp({ email, otp: code }))
        rememberSignInMethod('email')
        await enter(emailIsNew.current)
    }

    // The signup is stamped by the server on the next request, and the steward only rises once this
    // tab holds the stamp. Waiting for it here, with the code button still
    // pending, is what lets the dialog close onto the right screen. Never throws: the code was
    // right, and the forms would show it as wrong. Should the wait fail, the provider keeps asking.
    const settleSignup = async () => {
        try {
            await Promise.race([completeSignupAction(), new Promise(resolve => setTimeout(resolve, SETTLE_TIMEOUT_MS))])
        } catch {}
        await refreshUser?.().catch(() => {})
    }

    // `markConverted` comes before any await, so closing the dialog during the settle is not counted
    // as an abandon.
    const enter = async (created: boolean) => {
        funnel.markConverted()
        markResume()
        await settleSignup()
        toast.success(created ? t('accountCreated') : t('welcomeBack'))
        onEntered?.(created)
        reset()
        router.refresh()
    }

    const leaveForProvider = () => {
        funnel.markConverted()
        markResume()
    }

    const stepTo = (method: AuthMethod, codeSent: boolean) => {
        funnel.setStep(signupStep(method, codeSent))
        if (codeSent) setMovedOn(true)
    }

    const form = (
        <AuthMethods
            key={formKey}
            onMethodChange={method => {
                funnel.setStep(signupStep(method))
                setMovedOn(true)
            }}
            oauth={
                ENABLED_OAUTH_PROVIDERS.length > 0 && (
                    <>
                        {ENABLED_OAUTH_PROVIDERS.map(provider => (
                            <OAuthSignInButton key={provider} provider={provider} verb="Continue with" linkAnonymous onLeave={leaveForProvider} />
                        ))}
                    </>
                )
            }
            email={beforeEmail => <AnonymousEmailStep sendCode={sendCode} verifyCode={verifyCode} onStepChange={step => stepTo('email', step === 'code')} beforeEmail={beforeEmail} />}
        />
    )

    return { form, abandon: funnel.dismiss, reset, movedOn }
}
