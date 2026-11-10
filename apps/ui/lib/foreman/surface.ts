import type { ForemanSurface } from '@rerun/contracts'

import type { ForemanPhase } from './phase'

export type { ForemanSurface }

// Which foreman the workspace talks to, if any. The hub walks the onboarding and nothing else; the
// build claims the workspace's machine, and from there the foreman is the one running on it. A
// workspace past its onboarding with no machine, its box torn down or never claimed, has no foreman
// at all: the column and the orb are hidden.
export function foremanSurface(phase: ForemanPhase, hasEngine: boolean): ForemanSurface {
    if (phase !== 'companion') return 'onboarding'
    return hasEngine ? 'engine' : 'none'
}
