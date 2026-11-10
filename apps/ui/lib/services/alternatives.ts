// Jev's probability that a connector is a direct replacement for another, above which the pair
// counts as an alternative. Rows between the stored floor and this line are a review queue.
export const ALTERNATIVE_THRESHOLD = 0.5

// Marks a pair set by hand in the admin: probability 1 pins it as an alternative, 0 rules it out.
// The Jev script leaves these rows alone.
export const MANUAL_ALTERNATIVE_MODEL = 'manual'

// How many replacements the setup card offers under the app the agent asked for.
export const MAX_OFFERED_ALTERNATIVES = 3
