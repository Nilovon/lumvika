import type { ForemanToolName } from '../tool-defs'
import type { ForemanPhase, ForemanState } from '../phase'

// One declaration per phase, carrying both what the foreman reads and what it is allowed to call.
// Keeping them in the same object is the whole point: a phase whose instructions name a tool its
// belt does not hold is a model that tries, fails, and apologises to the user.
//
// A belt can be a function of the state for the same reason: the template tools only exist for
// someone who arrived on a template link, and a tool that is never declared cannot be called on a
// hunch.
export type ActiveForemanPhase = Exclude<ForemanPhase, 'waitlist' | 'companion'>

export type PhaseSpec = {
    phase: ActiveForemanPhase
    instructions: (state: ForemanState) => string
    tools: readonly ForemanToolName[] | ((state: ForemanState) => readonly ForemanToolName[])
}

export function phaseTools(spec: PhaseSpec, state: ForemanState): readonly ForemanToolName[] {
    return typeof spec.tools === 'function' ? spec.tools(state) : spec.tools
}
