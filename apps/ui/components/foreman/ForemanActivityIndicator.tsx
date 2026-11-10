'use client'

import { Orb } from '@/components/foreman/Orb'
import { LOADER_ORB_SIZE } from '@/components/foreman/constants'
import { foremanOrbState, selectForemanOpen, useForemanStore } from '@/stores/foreman.store'

/**
 * Ce qui tourne pendant qu'un tour se joue. Le Foreman ne met pas trois points là où il a une bête :
 * c'est elle qui réfléchit puis qui parle, à l'endroit exact où la réponse va s'écrire. Gelée quand
 * la colonne est repliée — le tour peut continuer après qu'on l'a refermée.
 */
export function ForemanActivityIndicator() {
    const open = useForemanStore(selectForemanOpen)
    const activity = useForemanStore(state => state.activity)

    return <Orb size={LOADER_ORB_SIZE} state={foremanOrbState({ open, activity })} paused={!open} facing="right" className="shrink-0" />
}
