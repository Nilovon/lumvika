'use client'

import { Orb } from '@/components/steward/Orb'
import { LOADER_ORB_SIZE } from '@/components/steward/constants'
import { stewardOrbState, selectStewardOpen, useStewardStore } from '@/stores/steward.store'

/**
 * Ce qui tourne pendant qu'un tour se joue. Le Steward ne met pas trois points là où il a une bête :
 * c'est elle qui réfléchit puis qui parle, à l'endroit exact où la réponse va s'écrire. Gelée quand
 * la colonne est repliée — le tour peut continuer après qu'on l'a refermée.
 */
export function StewardActivityIndicator() {
    const open = useStewardStore(selectStewardOpen)
    const activity = useStewardStore(state => state.activity)

    return <Orb size={LOADER_ORB_SIZE} state={stewardOrbState({ open, activity })} paused={!open} facing="right" className="shrink-0" />
}
