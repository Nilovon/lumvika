// How the library arrives. Everything the Template library reveals moves on this one curve, a hard
// deceleration, so a card comes in quickly and settles slowly rather than stopping dead.
export const LIBRARY_EASE = [0.16, 1, 0.3, 1] as const
export const LIBRARY_SETTLE = { duration: 0.5, ease: LIBRARY_EASE } as const

// A tile or a card comes down a few pixels out of focus and settles sharp. The drop is small on
// purpose: it is the blur clearing, not the travel, that reads as the thing coming to rest.
export const SETTLE_FROM = { opacity: 0, y: -8, filter: 'blur(6px)' }
export const SETTLED = { opacity: 1, y: 0, filter: 'blur(0px)' }

// Leaving is not a landing: no stagger, no travel, just a short blur out, so whatever stops
// matching never holds up what arrives in its place.
export const LEAVING = { opacity: 0, filter: 'blur(4px)', transition: { duration: 0.18, ease: LIBRARY_EASE } }
