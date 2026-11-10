import { Stack } from 'expo-router'

import { SignInFlowProvider } from '@/components/auth/SignInFlow'
import { useColorSchemeName } from '@/theme/theme'
import { palette } from '@/theme/tokens'

export default function SignInLayout() {
    const scheme = useColorSchemeName()
    return (
        <SignInFlowProvider>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="country" options={{ presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, contentStyle: { backgroundColor: palette[scheme].background } }} />
            </Stack>
        </SignInFlowProvider>
    )
}
