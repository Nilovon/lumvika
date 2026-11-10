import { BUDDY_GEOMETRY } from '../iso-grid/components/buddy/BuddyArt'
import { BUDDY_FACE_CENTER } from '../iso-grid/components/buddy/BuddyFace'

import type { OrbActivity } from './Orb'

// The face is drawn straight on the material: the drop has no plate.
export type StewardFace = 'bare'
export type StewardFacing = 'left' | 'right' | 'front'

export const STEWARD_VIEW_MARGIN = 2
export const STEWARD_VIEW_WIDTH = BUDDY_GEOMETRY.halfW * 2 + STEWARD_VIEW_MARGIN * 2

// Below this width the lit face's gradients and halos turn to mud: it is painted flat and larger.
export const SMALL_BELOW = 40
export const LISTENING_FACE_SCALE = 1.1
// The share of a mouthless wall's depth where `BuddyFace` puts the eyes.
export const FACE_EYE_SHARE = 0.45

type Motion = { amp: number; period: number; sheenPeriod: number }

// The four states never change the shape nor the material, only the rhythm.
export const MOTION: Record<OrbActivity, Motion> = {
    idle: { amp: 0, period: 0, sheenPeriod: 6 },
    listening: { amp: 0.03, period: 2.8, sheenPeriod: 6 },
    thinking: { amp: 0.09, period: 1.1, sheenPeriod: 1.8 },
    speaking: { amp: 0.05, period: 0.45, sheenPeriod: 4 },
}
