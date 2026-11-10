import type { StewardPhase } from '../phase'
import { BUILD_PHASE } from './build'
import { DISCOVER_PHASE } from './discover'
import { PLAN_PHASE } from './plan'
import type { ActiveStewardPhase, PhaseSpec } from './spec'
import { TRIAL_PHASE } from '@lumvika/cloud/steward'

export type { ActiveStewardPhase, PhaseSpec } from './spec'
export { phaseTools } from './spec'
export { forcesFirstPlan, pinnedPlanBoxes, planKinds } from './plan'

// No spec for `waitlist` nor `companion`: the route turns both away before any model is called, the
// first until a machine frees up, the second to the steward on the workspace's engine.
export const PHASES: Record<ActiveStewardPhase, PhaseSpec> = {
    discover: DISCOVER_PHASE,
    plan: PLAN_PHASE,
    trial: TRIAL_PHASE,
    build: BUILD_PHASE,
}

export function isOnboardingPhase(phase: StewardPhase): phase is ActiveStewardPhase {
    return phase !== 'waitlist' && phase !== 'companion'
}

export function phaseSpec(phase: StewardPhase): PhaseSpec {
    if (phase === 'waitlist') throw new Error('The steward has no turn to take while the workspace waits for a machine')
    if (phase === 'companion') throw new Error('The onboarding is over: the steward of this workspace runs on its engine')
    return PHASES[phase]
}
