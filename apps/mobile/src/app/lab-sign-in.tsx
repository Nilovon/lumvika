import { useLocalSearchParams } from 'expo-router'

import { SignInFlowProvider, type SignInStep } from '@/components/auth/SignInFlow'
import { SignInSheet } from '@/components/auth/SignInSheet'

// Dev only: the sign-in sheet in each of its steps, reachable while signed in.
const STEPS: Record<string, SignInStep> = {
    start: { name: 'start' },
    email: { name: 'email' },
    server: { name: 'server' },
    'code-email': { name: 'code', method: 'email' },
}

export default function SignInSheetLab() {
    const params = useLocalSearchParams<{ step?: string }>()
    const step = STEPS[params.step ?? 'start'] ?? STEPS.start
    return (
        <SignInFlowProvider key={params.step} initialStep={step}>
            <SignInSheet />
        </SignInFlowProvider>
    )
}
