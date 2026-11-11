import * as AppleAuthentication from 'expo-apple-authentication'
import { View } from 'react-native'
import { useTranslations } from 'use-intl'

import { useSignInFlow } from '@/components/auth/SignInFlow'
import { StepTitle } from '@/components/auth/steps/StepTitle'
import { TextLink } from '@/components/auth/TextLink'
import { useOAuthSignIn } from '@/components/auth/useSignInActions'
import { AppText } from '@/components/ui/AppText'
import { Button } from '@/components/ui/Button'
import { ProviderLogo } from '@/components/ui/ProviderLogo'
import { switchServer } from '@/config/custom-server'
import { onCustomServer, webHost } from '@/config/environment'
import { useTheme } from '@/theme/theme'
import { controlSize, spacing } from '@/theme/tokens'

function OAuthError({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <AppText variant="footnote" tone="destructive" style={{ textAlign: 'center' }}>
            {message}
        </AppText>
    )
}

function Choices() {
    const theme = useTheme()
    const { goTo } = useSignInFlow()
    const oauth = useOAuthSignIn()
    const t = useTranslations('mobileAuth')

    return (
        <View style={{ gap: spacing.sm }}>
            <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={theme.scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={controlSize.lg.radius}
                onPress={() => oauth.continueWith('apple')}
                style={{ height: controlSize.lg.height }}
            />
            <Button label={t('start.continueWithGoogle')} variant="outline" size="lg" icon={<ProviderLogo provider="google" size={17} />} loading={oauth.signingIn === 'google'} onPress={() => oauth.continueWith('google')} />
            <Button label={t('start.continueWithEmail')} variant="outline" size="lg" symbol="envelope" onPress={() => goTo({ name: 'email' })} />
            <OAuthError message={oauth.error} />
        </View>
    )
}

// A server of the person's own signs in by email code only: Apple and Google answer for Lumvika's
// app, not for that server.
function OwnServer() {
    const t = useTranslations('mobileAuth')
    const { goTo } = useSignInFlow()
    return (
        <View style={{ gap: spacing.lg, alignItems: 'center' }}>
            <View style={{ alignSelf: 'stretch' }}>
                <Button label={t('start.continueWithEmail')} size="lg" symbol="envelope" onPress={() => goTo({ name: 'email' })} />
            </View>
            <TextLink label={t('start.useCloud')} onPress={() => switchServer(null)} />
        </View>
    )
}

export function StartStep() {
    const t = useTranslations('mobileAuth')
    const { goTo } = useSignInFlow()
    if (onCustomServer) {
        return (
            <>
                <StepTitle title={t('start.welcome')} subtitle={webHost} />
                <OwnServer />
            </>
        )
    }
    return (
        <>
            <StepTitle title={t('start.title')} />
            <Choices />
            <View style={{ alignItems: 'center' }}>
                <TextLink label={t('start.ownServer')} onPress={() => goTo({ name: 'server' })} />
            </View>
        </>
    )
}
