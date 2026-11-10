import type { ReactNode } from 'react'
import { BUDDY_HEIGHT_RATIO } from '../../iso'
import type { BuddyLook } from '../../types'
import { BUDDY_FACE_CENTER, BuddyFace } from './BuddyFace'
import { BUDDY_STATE_COLOR, buddyColor, buddyEyes, buddyMouth, shade, type BuddyMood } from './buddy-look'
import { GrowsFrom, boxTop, type BoxGeometry } from './RoundedBox'

// Drawn in a 100-unit box whose floor point is (50, 86), the centre of the block's bottom diamond.
export const BUDDY_VIEW = { x: -16, y: -20, w: 132, h: 132 }
const HALF_W = 40
export const BUDDY_GEOMETRY: BoxGeometry = { base: { x: 50, y: 86 }, halfW: HALF_W, halfH: HALF_W / 2, depth: HALF_W * 2 * BUDDY_HEIGHT_RATIO, radius: 9 }

type BuddyArtProps = {
    uid: string
    id: string
    mood: BuddyMood
    look: BuddyLook
    // Paints the whole block in one colour, top included: a placement ghost has no identity yet.
    plain?: string
    geometry?: BoxGeometry
    // False paints the face flat, without the lit screen's gradients and filters: what a buddy
    // drawn a few pixels wide needs to stay crisp.
    lit?: boolean
    // Enlarges the face around its centre, on a wall tall enough to hold it.
    faceScale?: number
}

// A small lantern standing on the tile: a round body, a light cap in the agent's colour and a pale
// window band that carries the face. At work, broken or waiting, the cap takes the state's colour and
// the band its pale tint, so the board still reads amber, red and cyan from afar.
export function BuddyArt({ uid, id, mood, look, plain, geometry = BUDDY_GEOMETRY, lit = !plain, faceScale = 1 }: BuddyArtProps) {
    const body = plain ?? BUDDY_STATE_COLOR[mood]
    const resting = mood === 'idle' || mood === 'asleep'
    const identity = buddyColor(id, look)
    const cap = !plain && resting ? shade(identity, mood === 'asleep' ? -0.6 : -0.05) : body
    const band = plain ? shade(plain, 0.6) : mood === 'asleep' ? shade(body, 0.45) : resting ? PAPER : shade(body, 0.72)

    return (
        <Lantern
            uid={uid}
            geometry={geometry}
            color={body}
            cap={cap}
            band={band}
            glow={!plain && mood !== 'asleep'}
            face={
                <g transform={faceScale === 1 ? undefined : `translate(${BUDDY_FACE_CENTER * (1 - faceScale)} 0) scale(${faceScale})`}>
                    <BuddyFace
                        uid={uid}
                        eyes={buddyEyes(id, look)}
                        mouth={buddyMouth(id, look)}
                        mood={mood}
                        depth={geometry.depth / faceScale}
                        light={resting && !plain ? shade(identity, 0.35) : '#fff'}
                        lit={lit}
                        tint={resting ? identity : body}
                    />
                </g>
            }
            onTop={mood === 'working' ? <rect className="iso-buddy-sweep" x={geometry.base.x - geometry.halfW} y={geometry.base.y - geometry.depth - geometry.halfH} width={geometry.halfW} height={geometry.halfH * 2} fill={`url(#${uid}-sweep)`} /> : undefined}
            sweep={mood === 'working'}
        />
    )
}

const PAPER = '#F7F4EC'
// How much of the tile's diamond the lantern's round footprint spans.
const FOOTPRINT = 0.78
const STRETCH_HEADROOM = 1

type LanternProps = {
    uid: string
    geometry: BoxGeometry
    color: string
    cap: string
    band: string
    glow: boolean
    face: ReactNode
    onTop?: ReactNode
    sweep: boolean
}

// The body is a cylinder on the tile's floor point. Like the block it replaces, only its top moves
// (`iso-buddy-top`) and the wall stretches under it (`iso-buddy-wall`); the band and the face are
// painted on the wall (`iso-buddy-painted`) and keep their size.
function Lantern({ uid, geometry, color, cap, band, glow, face, onTop, sweep }: LanternProps) {
    const { base, depth } = geometry
    const rx = geometry.halfW * FOOTPRINT
    const ry = geometry.halfH * FOOTPRINT
    const top = boxTop(geometry)
    const x0 = base.x - rx
    const headroom = depth * STRETCH_HEADROOM
    // The face's plane: x = BUDDY_FACE_CENTER sits on the front of the wall, y = 0 on its top edge.
    const plane = `translate(${base.x - BUDDY_FACE_CENTER} ${top.y + ry})`
    const c = BUDDY_FACE_CENTER
    const b0 = depth * 0.16 - ry
    const b1 = depth * 0.88 - ry
    const bandPath = `M${c - rx} ${b0} A${rx} ${ry} 0 0 0 ${c + rx} ${b0} L${c + rx} ${b1} A${rx} ${ry} 0 0 1 ${c - rx} ${b1} Z`

    return (
        <>
            <defs>
                <linearGradient id={`${uid}-side`} x1={x0} x2={base.x + rx} y1="0" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" style={{ stopColor: shade(color, -0.05) }} />
                    <stop offset="50%" style={{ stopColor: shade(color, -0.25) }} />
                    <stop offset="100%" style={{ stopColor: shade(color, -0.55) }} />
                </linearGradient>
                <linearGradient id={`${uid}-band`} x1={c - rx} x2={c + rx} y1="0" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" style={{ stopColor: band }} />
                    <stop offset="55%" style={{ stopColor: band }} />
                    <stop offset="100%" style={{ stopColor: shade(band, -0.32) }} />
                </linearGradient>
                <radialGradient id={`${uid}-cap`} cx="50%" cy="50%" r="60%">
                    <stop offset="0%" style={{ stopColor: shade(cap, 0.5) }} />
                    <stop offset="60%" style={{ stopColor: cap }} />
                    <stop offset="100%" style={{ stopColor: shade(cap, -0.25) }} />
                </radialGradient>
                {glow && (
                    <radialGradient id={`${uid}-glow`}>
                        <stop offset="0%" style={{ stopColor: cap, stopOpacity: 0.45 }} />
                        <stop offset="100%" style={{ stopColor: cap, stopOpacity: 0 }} />
                    </radialGradient>
                )}
                {sweep && (
                    <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#fff" stopOpacity="0" />
                        <stop offset="50%" stopColor="#fff" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                    </linearGradient>
                )}
                <clipPath id={`${uid}-top-clip`}>
                    <ellipse cx={top.x} cy={top.y} rx={rx} ry={ry} />
                </clipPath>
                <clipPath id={`${uid}-body-clip`}>
                    <ellipse cx={base.x} cy={base.y} rx={rx} ry={ry} />
                    <rect x={x0} y={top.y - headroom} width={rx * 2} height={depth + headroom} />
                </clipPath>
            </defs>

            <g clipPath={`url(#${uid}-body-clip)`}>
                <GrowsFrom y={base.y}>
                    <rect x={x0 - 2} y={top.y} width={rx * 2 + 4} height={depth + ry + 2} fill={`url(#${uid}-side)`} />
                </GrowsFrom>
                <g transform={plane}>
                    <GrowsFrom y={depth} painted>
                        <path d={bandPath} fill={`url(#${uid}-band)`} />
                        {face}
                    </GrowsFrom>
                </g>
            </g>

            <g className="iso-buddy-top">
                {glow && <ellipse cx={top.x} cy={top.y} rx={rx + 10} ry={ry + 8} fill={`url(#${uid}-glow)`} />}
                <ellipse cx={top.x} cy={top.y} rx={rx} ry={ry} fill={`url(#${uid}-cap)`} />
                <g clipPath={`url(#${uid}-top-clip)`}>
                    <ellipse cx={top.x - rx * 0.28} cy={top.y - ry * 0.32} rx={rx * 0.3} ry={ry * 0.2} fill="#fff" fillOpacity={0.35} />
                    {onTop}
                </g>
                <ellipse cx={top.x} cy={top.y} rx={rx - 0.4} ry={ry - 0.4} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.8} />
            </g>
        </>
    )
}
