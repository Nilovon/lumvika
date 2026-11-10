import type { PhaseSpec } from '@/lib/foreman/phases/spec'

// Never reached: a workspace here is entitled from its first minute, so the foreman goes straight
// from the agreed plan to the build. Kept so the phase table stays complete.
export const TRIAL_PHASE: PhaseSpec = {
    phase: 'trial',
    instructions: () => 'Their workspace is ready. Say in one line that their coworkers are being set up.',
    tools: ['search_docs', 'contact_team'],
}
