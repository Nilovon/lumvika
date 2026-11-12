'use client'

import { useOnboardingStore } from '@/stores/onboarding.store'
import { useStewardStore } from '@/stores/steward.store'
import { useSession } from '@/supabase/session/SessionProvider'

/**
 * The walls an account meets before the app opens, whatever page it lands on: the phone number, and
 * the waitlist when no machine is free.
 *
 * Arrivé sur une template ou un partage : la colonne demande elle-même le compte puis le code du
 * téléphone, avec ce qu'il a cliqué sous les yeux, et les deux murs lui cèdent la place. Le lien
 * parké tient la supposition le temps que la phase revienne, sinon le mur du téléphone surgit
 * entre la création du compte et la reprise du tunnel.
 */
export function useEntryWalls() {
    const { workspace, isAnonymous, phoneStep } = useSession()
    const stewardFunnel = useStewardStore(state => state.funnel)
    const stewardOpen = useStewardStore(state => state.open)
    const stewardArrival = useStewardStore(state => state.arrival)
    const stewardWaitlisted = useStewardStore(state => state.waitlisted)
    const readyMadeParked = useOnboardingStore(s => s.pendingTemplateLink !== null || s.pendingShareLink !== null)
    const arrivalHoldsTheWall = stewardArrival ? stewardFunnel === 'guided' && !stewardArrival.installed && stewardOpen !== false : stewardFunnel === 'unknown' && readyMadeParked && !workspace?.onboarded_at

    return {
        arrivalHoldsTheWall,
        phoneWallOpen: phoneStep === 'pending' && !arrivalHoldsTheWall,
        waitlistWallOpen: stewardWaitlisted && !isAnonymous,
    }
}
