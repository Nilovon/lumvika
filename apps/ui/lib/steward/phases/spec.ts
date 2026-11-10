import type { StewardToolName } from '../tool-defs'
import type { StewardPhase, StewardState } from '../phase'

// One declaration per phase, carrying both what the steward reads and what it is allowed to call.
// Keeping them in the same object is the whole point: a phase whose instructions name a tool its
// belt does not hold is a model that tries, fails, and apologises to the user.
//
// A belt can be a function of the state for the same reason: the template tools only exist for
// someone who arrived on a template link, and a tool that is never declared cannot be called on a
// hunch.
export type ActiveStewardPhase = Exclude<StewardPhase, 'waitlist' | 'companion'>

export type PhaseSpec = {
    phase: ActiveStewardPhase
    instructions: (state: StewardState) => string
    tools: readonly StewardToolName[] | ((state: StewardState) => readonly StewardToolName[])
}

export function phaseTools(spec: PhaseSpec, state: StewardState): readonly StewardToolName[] {
    return typeof spec.tools === 'function' ? spec.tools(state) : spec.tools
}
