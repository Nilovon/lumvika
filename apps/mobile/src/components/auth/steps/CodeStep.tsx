import { useState } from 'react'
import { View } from 'react-native'
import { useTranslations } from 'use-intl'

import { CodeField } from '@/components/auth/CodeField'
import { useSignInFlow } from '@/components/auth/SignInFlow'
import { StepTitle } from '@/components/auth/steps/StepTitle'
import { TextLink } from '@/components/auth/TextLink'
import { useSignInErrorText } from '@/components/auth/useSignInActions'
import { useSecondsSince } from '@/components/auth/useSecondsSince'
import { AppText } from '@/components/ui/AppText'
import { Button } from '@/components/ui/Button'
import { CODE_LENGTH, sendEmailCode, signInWithEmail } from '@/auth/sign-in'
import { spacing } from '@/theme/tokens'

// Same wait as the web before a new code can be asked for.
const RESEND_AFTER_SECONDS = 60

export function CodeStep() {
    const { email, back, setThinking } = useSignInFlow()
    const t = useTranslations('mobileAuth')
    const errorText = useSignInErrorText()
    const [sentAt, setSentAt] = useState(() => Date.now())
    const [code, setCode] = useState('')
    const [verifying, setVerifying] = useState(false)
    const [resending, setResending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const elapsed = useSecondsSince(sentAt)
    const resendIn = Math.max(0, RESEND_AFTER_SECONDS - elapsed)

    // Once the session opens, the root layout swaps the sign-in screens for the app on its own.
    const verify = async (value: string) => {
        setVerifying(true)
        setThinking(true)
        setError(null)
        try {
            await signInWithEmail(email.trim(), value)
        } catch (failure) {
            setError(errorText(failure))
            setCode('')
            setVerifying(false)
            setThinking(false)
        }
    }

    const resend = async () => {
        setResending(true)
        setThinking(true)
        setError(null)
        try {
            await sendEmailCode(email.trim())
            setSentAt(Date.now())
        } catch (failure) {
            setError(errorText(failure))
        } finally {
            setResending(false)
            setThinking(false)
        }
    }

    return (
        <>
            <StepTitle title={t('code.title')} subtitle={t('code.sentByEmail', { email: email.trim() })} />
            <CodeField length={CODE_LENGTH} value={code} onChangeText={setCode} onComplete={verify} disabled={verifying} invalid={Boolean(error)} />
            {error && (
                <AppText variant="footnote" tone="destructive" style={{ textAlign: 'center' }}>
                    {error}
                </AppText>
            )}
            <Button label={t('code.continue')} size="lg" loading={verifying} disabled={code.length < CODE_LENGTH} onPress={() => verify(code)} />
            <View style={{ alignItems: 'center', gap: spacing.lg, marginTop: spacing.xs }}>
                <TextLink label={resendIn > 0 ? t('code.resendIn', { seconds: resendIn }) : t('code.resend')} disabled={resendIn > 0 || resending} onPress={resend} />
                <TextLink label={t('code.differentEmail')} onPress={back} />
            </View>
        </>
    )
}
