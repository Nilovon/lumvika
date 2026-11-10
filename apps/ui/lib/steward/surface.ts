import type { StewardSurface } from '@lumvika/contracts'

import type { StewardPhase } from './phase'

export type { StewardSurface }

// Which steward the workspace talks to, if any. The hub walks the onboarding and nothing else; the
// build claims the workspace's machine, and from there the steward is the one running on it. A
// workspace past its onboarding with no machine, its box torn down or never claimed, has no steward
// at all: the column and the orb are hidden.
export function stewardSurface(phase: StewardPhase, hasEngine: boolean): StewardSurface {
    if (phase !== 'companion') return 'onboarding'
    return hasEngine ? 'engine' : 'none'
}
