'use client'

import { useId, type CSSProperties, type ReactNode, type RefObject } from 'react'

import { cn } from '../cn'
import { BUDDY_FACE_CENTER, BuddyFace } from '../iso-grid/components/buddy/BuddyFace'
import type { BuddyEyes } from '../iso-grid/types'

import type { OrbActivity } from './Orb'
import { FACE_EYE_SHARE, STEWARD_VIEW_MARGIN, STEWARD_VIEW_WIDTH, StewardFacePlate, LISTENING_FACE_SCALE, MOTION, SMALL_BELOW, type StewardFace, type StewardFacing } from './steward-face'
import { STEWARD_MATERIALS, type StewardMaterialKey } from './steward-materials'

// Drawn in the buddy's units, in the box of a ball as wide as an agent's block: a drop of light whose
// round belly rests on the floor line and whose tip reaches the top of that box.
const RADIUS = 40
const CENTER = { x: 50, y: 44 }
const FLOOR = CENTER.y + RADIUS
const TIP = CENTER.y - RADIUS
// The belly: the sphere the face slides over when the drop turns.
const BELLY = { x: CENTER.x, y: FLOOR - 33, r: 33 }
const DROP_PATH = (() => {
    const reach = Math.acos(BELLY.r / (BELLY.y - TIP))
    const dx = BELLY.r * Math.sin(reach)
    const y = BELLY.y - BELLY.r * Math.cos(reach)
    const f = (n: number) => n.toFixed(2)
    return `M${f(CENTER.x)} ${f(TIP)} C${f(CENTER.x + 6)} ${f(TIP + 14)} ${f(CENTER.x + dx)} ${f(y - 6)} ${f(CENTER.x + dx)} ${f(y)} A${BELLY.r} ${BELLY.r} 0 1 1 ${f(CENTER.x - dx)} ${f(y)} C${f(CENTER.x - dx)} ${f(y - 6)} ${f(CENTER.x - 6)} ${f(TIP + 14)} ${f(CENTER.x)} ${f(TIP)} Z`
})()
const MARGIN = STEWARD_VIEW_MARGIN
const BELOW_FLOOR = 5
const VIEW_HEIGHT = RADIUS * 2 + MARGIN + BELOW_FLOOR
// How far under its floor line the ball's box ends, as a share of its width.
export const STEWARD_BALL_FLOOR_SHARE = BELOW_FLOOR / STEWARD_VIEW_WIDTH
// What a ball asked to be one diameter wide needs: how much wider its box is than its sphere, and
// how far the sphere sits from the box's top left corner, as a share of the diameter.
export const STEWARD_BALL_FRAME = { scale: STEWARD_VIEW_WIDTH / (RADIUS * 2), inset: MARGIN / (RADIUS * 2) }

const FACE_SCALE = 1.3
const SMALL_FACE_SCALE = 1.6
// Where the eyes sit on the belly: off-centre towards the front-left.
const FACE_AT = { x: BELLY.x - 9, y: BELLY.y - 2 }
// A buddy's wall leans by 0.5; a ball only hints at the same turn.
const FACE_LEAN = 0.2
const MAX_FACE_LEAN = 0.35
const EYE_Y = 10

const REST_PITCH = Math.asin((BELLY.y - FACE_AT.y) / BELLY.r)
// Where the ball is turned when nothing moves it, in radians: the pose that puts the face on `FACE_AT`.
export const STEWARD_FACE_REST = { yaw: Math.asin((FACE_AT.x - BELLY.x) / (BELLY.r * Math.cos(REST_PITCH))), pitch: REST_PITCH }

// The face carried by a drop turned by `yaw` (to the right) and `pitch` (upwards): it slides over the
// belly, flattens as it nears the rim and is gone once it has turned to the far side.
export function stewardFacePose(yaw: number, pitch: number) {
    const towards = Math.cos(yaw)
    if (towards <= 0) return 'scale(0)'
    const x = BELLY.x + BELLY.r * Math.sin(yaw) * Math.cos(pitch)
    const y = BELLY.y - BELLY.r * Math.sin(pitch)
    const lean = Math.max(-MAX_FACE_LEAN, Math.min(MAX_FACE_LEAN, (FACE_LEAN * Math.sin(yaw)) / Math.sin(STEWARD_FACE_REST.yaw)))
    const scaleX = towards / Math.cos(STEWARD_FACE_REST.yaw)
    const scaleY = Math.cos(pitch) / Math.cos(STEWARD_FACE_REST.pitch)
    return `translate(${x.toFixed(3)} ${y.toFixed(3)}) matrix(1 ${lean.toFixed(4)} 0 1 0 0) scale(${scaleX.toFixed(4)} ${scaleY.toFixed(4)})`
}

const REST_YAW_SIDE: Record<StewardFacing, number> = { left: 1, front: 0, right: -1 }

// The resting pose of a ball asked to look one way: the same tilt, turned to the other side or not at all.
export function stewardFaceRest(facing: StewardFacing) {
    return { yaw: STEWARD_FACE_REST.yaw * REST_YAW_SIDE[facing], pitch: STEWARD_FACE_REST.pitch }
}

// Scales and lifts its children from the point where the ball touches the floor.
function FromFloor({ className, children }: { className: string; children: ReactNode }) {
    return (
        <g transform={`translate(${CENTER.x} ${FLOOR})`}>
            <g className={className}>
                <g transform={`translate(${-CENTER.x} ${-FLOOR})`}>{children}</g>
            </g>
        </g>
    )
}

export function stewardBallHeight(size: number, scale: number) {
    return (size * scale * VIEW_HEIGHT) / STEWARD_VIEW_WIDTH
}

type StewardBallProps = {
    material: StewardMaterialKey
    // Diameter as a share of an agent's width.
    scale: number
    // Width in pixels of an agent standing next to it: the ball is `scale` times that.
    size: number
    face?: StewardFace
    eyes?: BuddyEyes
    state?: OrbActivity
    animated?: boolean
    facing?: StewardFacing
    // The group holding the eyes, in the face's own units, for whoever moves the gaze.
    eyesRef?: RefObject<SVGGElement | null>
    // The group that places the face on the sphere, for whoever turns the ball: see `stewardFacePose`.
    faceRef?: RefObject<SVGGElement | null>
    className?: string
}

export function StewardBall({ material: materialKey, scale, size, face = 'plate', eyes = 'pill', state = 'idle', animated = true, facing = 'left', eyesRef, faceRef, className }: StewardBallProps) {
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
    const material = STEWARD_MATERIALS[materialKey]
    const paint = material.ball
    const width = size * scale

    const small = width < SMALL_BELOW
    const faceScale = (small ? SMALL_FACE_SCALE : FACE_SCALE) * (state === 'listening' ? LISTENING_FACE_SCALE : 1)
    // The face is drawn in dark ink: on a plate or a dark material it is turned light.
    const lightInk = face === 'plate' || material.bareInk === 'light'

    const motion = MOTION[state]
    const moving = animated && motion.amp > 0
    const viewBox = `${CENTER.x - STEWARD_VIEW_WIDTH / 2} ${CENTER.y - RADIUS - MARGIN} ${STEWARD_VIEW_WIDTH} ${VIEW_HEIGHT}`
    const outline = material.outline.length > 1 ? `url(#${uid}-outline)` : material.outline[0]
    const rest = stewardFaceRest(facing)

    return (
        <span
            aria-hidden
            data-steward-motion={moving ? '' : undefined}
            data-buddy-still={animated ? undefined : ''}
            className={cn('relative inline-flex shrink-0', className)}
            style={
                {
                    width,
                    height: stewardBallHeight(size, scale),
                    '--steward-amp': motion.amp,
                    '--steward-period': `${motion.period}s`,
                    '--steward-sheen-period': `${motion.sheenPeriod}s`,
                } as CSSProperties
            }
        >
            <svg viewBox={viewBox} width="100%" height="100%" style={{ overflow: 'visible' }}>
                <defs>
                    <radialGradient id={`${uid}-body`} cx={BELLY.x - 12} cy={BELLY.y - 14} r={BELLY.r * 1.7} gradientUnits="userSpaceOnUse">
                        {paint.stops.map(([offset, color]) => (
                            <stop key={offset} offset={offset} stopColor={color} />
                        ))}
                    </radialGradient>
                    <linearGradient id={`${uid}-outline`} x1="0" y1="0" x2="1" y2="1">
                        {material.outline.map((color, i) => (
                            <stop key={i} offset={i / Math.max(1, material.outline.length - 1)} stopColor={color} />
                        ))}
                    </linearGradient>
                    <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={material.sheen} stopOpacity="0" />
                        <stop offset="50%" stopColor={material.sheen} stopOpacity="0.55" />
                        <stop offset="100%" stopColor={material.sheen} stopOpacity="0" />
                    </linearGradient>
                    <radialGradient id={`${uid}-aura`}>
                        <stop offset="0%" stopColor={material.aura} stopOpacity="0.55" />
                        <stop offset="100%" stopColor={material.aura} stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id={`${uid}-shadow`}>
                        <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#000" stopOpacity="0" />
                    </radialGradient>
                    <clipPath id={`${uid}-clip`}>
                        <path d={DROP_PATH} />
                    </clipPath>
                    <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="1.6" />
                    </filter>
                </defs>

                {material.aura && <ellipse cx={CENTER.x} cy={FLOOR - 1} rx={BELLY.r * 1.25} ry={BELLY.r * 0.32} fill={`url(#${uid}-aura)`} />}
                <FromFloor className="steward-ball-shadow">
                    <ellipse cx={CENTER.x} cy={FLOOR} rx={BELLY.r * 0.72} ry={BELOW_FLOOR - 1} fill={`url(#${uid}-shadow)`} />
                </FromFloor>

                <FromFloor className="steward-ball-body">
                    <path d={DROP_PATH} fill={`url(#${uid}-body)`} />
                    <g clipPath={`url(#${uid}-clip)`}>
                        {animated && (
                            <g transform="skewX(-18)">
                                <rect className="steward-buddy-sheen" x={CENTER.x - RADIUS - 24} y={CENTER.y - RADIUS} width={20} height={RADIUS * 2} fill={`url(#${uid}-sheen)`} />
                            </g>
                        )}
                        <g ref={faceRef} transform={stewardFacePose(rest.yaw, rest.pitch)}>
                            <g transform={`scale(${faceScale}) translate(${-BUDDY_FACE_CENTER} ${-EYE_Y})`}>
                                {face === 'plate' && <StewardFacePlate uid={uid} y={EYE_Y} colors={material.plate} />}
                                <g ref={eyesRef} style={lightInk ? { filter: 'invert(1)' } : undefined}>
                                    <BuddyFace uid={uid} eyes={eyes} mouth="none" mood={state === 'thinking' ? 'working' : 'idle'} depth={EYE_Y / FACE_EYE_SHARE} light={material.eyeLight} lit={!small} tint={material.eyeTint} />
                                </g>
                            </g>
                        </g>
                    </g>
                    {material.neon && <path d={DROP_PATH} fill="none" stroke={outline} strokeWidth={3} strokeOpacity={0.8} filter={`url(#${uid}-glow)`} />}
                    <path d={DROP_PATH} fill="none" stroke={outline} strokeOpacity={material.neon ? 1 : 0.45} strokeWidth={material.neon ? 1.1 : 0.8} />
                </FromFloor>
            </svg>
        </span>
    )
}
