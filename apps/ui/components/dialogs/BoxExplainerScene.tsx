'use client'

import { useBoxExplainerWalk } from '@/components/dialogs/useBoxExplainerWalk'
import { TourScene } from '@rerun/ui/tour'

// The onboarding tour's plateau, played on its own in the right-hand column of the Box dialogs, and
// stopped at the agents (cf. useBoxExplainerWalk). Nobody reads a definition of a Box; this is the
// one thing in the product that shows one.
//
// One shot for the whole scene, and it is the tour's **wide** one, fitted on the plateau the walk
// actually builds: the close-up on Marketing exists to make eight tools landing at once readable
// while a slide is being read, and there is nothing to read here. Hence `wide` and `connectors`
// turned off.
//
// `band` is the strip at the bottom of the panel the copy is laid on.
export function BoxExplainerScene({ band, className }: { band: number; className?: string }) {
    const phase = useBoxExplainerWalk()

    return <TourScene phase={phase} active wide connectors={false} bandBottom={band} className={className} />
}
