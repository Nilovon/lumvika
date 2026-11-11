import { Stack } from 'expo-router'

import { SignInFlowProvider } from '@/components/auth/SignInFlow'

export default function SignInLayout() {
    return (
        <SignInFlowProvider>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
            </Stack>
        </SignInFlowProvider>
    )
}
