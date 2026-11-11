'use client'

import { useErrorText } from '@/hooks/useErrorText'
import { prepareEmailSignIn } from '@/app/(authflow)/auth/actions'
import { EmailCodeForm, type EmailCodeStep } from '@/components/auth/EmailCodeForm'
import { useCaptcha } from '@/components/auth/captcha/useCaptcha'
import { EmailSendError, trackEmailSend } from '@/components/auth/email-send'
import { authCall, authClient } from '@/lib/auth/auth-client'
import { rememberSignInMethod } from '@/lib/auth/last-sign-in'
import { cn } from '@/lib/utils'
import { SIGNUP_INTENT_COOKIE } from '@lumvika/analytics'
import { setSharedCookie } from '@lumvika/analytics/client'
import { useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

// One flow for both sign-in and sign-up: the server opens the account first if the address is new,
// then the auth layer mails the code. The intent cookie is only set when the server did open it: an
// existing account signing in on a new browser soon after its signup would otherwise be counted
// twice. A code mailed again keeps the cookie the first one set.
export default function EmailAuth({ beforeEmail, onStepChange, onSignedIn }: { beforeEmail?: ReactNode; onStepChange: (step: EmailCodeStep) => void; onSignedIn: () => void }) {
    const searchParams = useSearchParams()
    const errorText = useErrorText()
    const { containerRef, challenging, getToken } = useCaptcha()

    const sendCode = (email: string) =>
        trackEmailSend(async () => {
            const prepared = await prepareEmailSignIn({ email, captcha: await getToken() })
            if (!prepared.ok) throw new EmailSendError(errorText(prepared), prepared.reason)
            if (prepared.created) setSharedCookie(SIGNUP_INTENT_COOKIE, 'email', 1)
            await authCall(authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' }))
        })

    const verifyCode = async (email: string, code: string) => {
        await authCall(authClient.signIn.emailOtp({ email, otp: code }))
        rememberSignInMethod('email')
        onSignedIn()
    }

    return (
        <div>
            <EmailCodeForm defaultEmail={searchParams.get('email') ?? ''} sendCode={sendCode} verifyCode={verifyCode} onStepChange={onStepChange} beforeEmail={beforeEmail} />
            <div ref={containerRef} className={cn('flex justify-center', challenging && 'mt-4')} />
        </div>
    )
}
