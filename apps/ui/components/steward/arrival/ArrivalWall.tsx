'use client'

import { track } from '@lumvika/analytics/client'
import { useEffect } from 'react'

import { AuthTerms } from '@/components/auth/AuthShell'
import { PhoneVerificationStep } from '@lumvika/cloud/phone.client'
import { useAnonymousSignUp } from '@/components/auth/useAnonymousSignUp'

const SURFACE = 'ready_made_arrival'

// The account and the phone code, asked in the column rather than in a dialog over the board: what
// they picked stays in sight the whole way. Both are the forms the dialogs mount.
function AccountStep() {
    const { form } = useAnonymousSignUp({ surface: SURFACE, active: true })

    useEffect(() => {
        track('signup_gate_viewed', { surface: SURFACE })
    }, [])

    return (
        <>
            {form}
            <p className="text-center text-xs text-muted-foreground">
                <AuthTerms />
            </p>
        </>
    )
}

export function ArrivalWall({ step }: { step: 'account' | 'phone' }) {
    return <div className="flex flex-col gap-6">{step === 'account' ? <AccountStep /> : <PhoneVerificationStep active />}</div>
}
