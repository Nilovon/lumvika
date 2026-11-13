'use client'

import { useOnboardingStore } from '@/stores/onboarding.store'
import { useStewardStore } from '@/stores/steward.store'
import { useSession } from '@/lib/auth/session/SessionProvider'

/**
 * The walls an account meets before the app opens, whatever page it lands on: the waitlist when no
 * machine is free.
 *
 * Arrivé sur une template ou un partage : la colonne demande elle-même le compte, avec ce qu'il a
 * cliqué sous les yeux, et le mur lui cède la place. Le lien parké tient la supposition le temps que
 * la phase revienne.
 */
export function useEntryWalls() {
    const { workspace, isAnonymous } = useSession()
    const stewardFunnel = useStewardStore(state => state.funnel)
    const stewardOpen = useStewardStore(state => state.open)
    const stewardArrival = useStewardStore(state => state.arrival)
    const stewardWaitlisted = useStewardStore(state => state.waitlisted)
    const readyMadeParked = useOnboardingStore(s => s.pendingTemplateLink !== null || s.pendingShareLink !== null)
    const arrivalHoldsTheWall = stewardArrival ? stewardFunnel === 'guided' && !stewardArrival.installed && stewardOpen !== false : stewardFunnel === 'unknown' && readyMadeParked && !workspace?.onboarded_at

    return {
        arrivalHoldsTheWall,
        waitlistWallOpen: stewardWaitlisted && !isAnonymous,
    }
}
