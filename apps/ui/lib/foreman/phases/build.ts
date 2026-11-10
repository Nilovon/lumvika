import type { PhaseSpec } from './spec'

// The payoff, run by the app and never by the model: the plan is confirmed and the trial is on, so
// the route builds the team itself (scripted.ts, build-team.ts) whatever the request says. This spec
// only exists because every phase has one; nothing ever reads it to a model.
export const BUILD_PHASE: PhaseSpec = {
    phase: 'build',
    instructions: () => '',
    tools: [],
}
