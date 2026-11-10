import { useId, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'

import { useTheme } from '@/theme/theme'

import { BUDDY_FACE_CENTER, BuddyFace } from './BuddyFace'
import { BUDDY_GEOMETRY, boxTop, type BoxGeometry } from './geometry'
import { buddyColor, buddyEyes, buddyMouth, hashUnit, shade, type BuddyEyes, type BuddyLook, type BuddyMood } from './look'
import { BuddyMotionScope, GrowsFrom, RidesOnWalls, Sweep } from './motion'

// Ported from packages/ui/src/iso-grid/components/buddy (AgentBuddy, BuddyArt): an agent's buddy
// away from the board, the same lantern, colour and eyes, drawn from the same id.

// Below this width the board's block is too squat for its face to read: the buddy stands taller,
// its face is painted flat and larger, and it loses its mouth.
const SMALL_BELOW = 40
const SMALL_GEOMETRY: BoxGeometry = { ...BUDDY_GEOMETRY, depth: 30 }
const SMALL_FACE_SCALE = 1.6
// Eyes whose thin strokes do not survive a few pixels are drawn as their closest solid shape.
const SMALL_EYES: Partial<Record<BuddyEyes, BuddyEyes>> = { glasses: 'round', shades: 'visor', line: 'pill', dot: 'round' }
const MARGIN = 2

const STATE_COLOR: Record<'working' | 'error' | 'waiting', string> = { working: '#f59e0b', error: '#ef4444', waiting: '#06b6d4' }

function smallLook(agentId: string): BuddyLook {
    const eyes = buddyEyes(agentId, {})
    return { mouth: 'none', eyes: SMALL_EYES[eyes] ?? eyes }
}

type AgentBuddyProps = {
    agentId: string
    mood?: BuddyMood
    // Width in points of the square the block is centred in.
    size: number
    // False holds it still, blink included: a long list of buddies should not twinkle.
    animated?: boolean
    // A buddy looks at what it stands next to: right when its text follows it, left when alone.
    facing?: 'left' | 'right'
    style?: StyleProp<ViewStyle>
}

export function AgentBuddy({ agentId, mood = 'idle', size, animated = true, facing = 'left', style }: AgentBuddyProps) {
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
    const theme = useTheme()
    const small = size < SMALL_BELOW
    const geometry = small ? SMALL_GEOMETRY : BUDDY_GEOMETRY
    const look = small ? smallLook(agentId) : {}

    const side = geometry.halfW * 2 + MARGIN * 2
    const blockCentreY = geometry.base.y - geometry.depth / 2
    const viewBox = `${geometry.base.x - side / 2} ${blockCentreY - side / 2} ${side} ${side}`

    const body = mood === 'idle' ? theme.buddyBody : mood === 'asleep' ? theme.buddyAsleep : STATE_COLOR[mood]
    const resting = mood === 'idle' || mood === 'asleep'
    const identity = buddyColor(agentId, look)
    const cap = resting ? shade(identity, mood === 'asleep' ? -0.6 : -0.05) : body
    const band = mood === 'asleep' ? shade(body, 0.45) : resting ? PAPER : shade(body, 0.72)
    const faceScale = small ? SMALL_FACE_SCALE : 1
    const motion = animated ? { kind: mood === 'working' ? ('bob' as const) : mood === 'error' ? ('shudder' as const) : null, offset: hashUnit(agentId, 7) * 4, blinkOffset: hashUnit(agentId, 9) * 4.6 } : null

    return (
        <View pointerEvents="none" style={[{ width: size, height: size, transform: facing === 'right' ? [{ scaleX: -1 }] : undefined, opacity: mood === 'asleep' ? 0.8 : 1 }, style]}>
            <BuddyMotionScope motion={mood === 'asleep' ? null : motion}>
                <Svg viewBox={viewBox} width="100%" height="100%">
                    <Lantern
                        uid={uid}
                        geometry={geometry}
                        color={body}
                        cap={cap}
                        band={band}
                        glow={mood !== 'asleep'}
                        face={
                            <G transform={faceScale === 1 ? undefined : `translate(${BUDDY_FACE_CENTER * (1 - faceScale)} 0) scale(${faceScale})`}>
                                <BuddyFace
                                    uid={uid}
                                    eyes={buddyEyes(agentId, look)}
                                    mouth={buddyMouth(agentId, look)}
                                    mood={mood}
                                    depth={geometry.depth / faceScale}
                                    light={resting ? shade(identity, 0.35) : '#ffffff'}
                                    lit={!small}
                                    tint={resting ? identity : body}
                                />
                            </G>
                        }
                        working={mood === 'working'}
                    />
                </Svg>
            </BuddyMotionScope>
        </View>
    )
}

const PAPER = '#F7F4EC'
// How much of the tile's diamond the lantern's round footprint spans.
const FOOTPRINT = 0.78

type LanternProps = {
    uid: string
    geometry: BoxGeometry
    color: string
    cap: string
    band: string
    glow: boolean
    face: ReactNode
    working: boolean
}

// A small lantern: a round body, a light cap and a pale window band carrying the face. Only the cap
// moves; the wall stretches under it and the band keeps its size.
function Lantern({ uid, geometry, color, cap, band, glow, face, working }: LanternProps) {
    const { base, depth } = geometry
    const rx = geometry.halfW * FOOTPRINT
    const ry = geometry.halfH * FOOTPRINT
    const top = boxTop(geometry)
    const x0 = base.x - rx
    const ceiling = base.y - depth * 2
    const c = BUDDY_FACE_CENTER
    const b0 = depth * 0.16 - ry
    const b1 = depth * 0.88 - ry
    const bandPath = `M${c - rx} ${b0} A${rx} ${ry} 0 0 0 ${c + rx} ${b0} L${c + rx} ${b1} A${rx} ${ry} 0 0 1 ${c - rx} ${b1} Z`

    return (
        <>
            <Defs>
                <LinearGradient id={`${uid}-side`} x1={x0} x2={base.x + rx} y1="0" y2="0" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor={shade(color, -0.05)} />
                    <Stop offset="0.5" stopColor={shade(color, -0.25)} />
                    <Stop offset="1" stopColor={shade(color, -0.55)} />
                </LinearGradient>
                <LinearGradient id={`${uid}-band`} x1={c - rx} x2={c + rx} y1="0" y2="0" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor={band} />
                    <Stop offset="0.55" stopColor={band} />
                    <Stop offset="1" stopColor={shade(band, -0.32)} />
                </LinearGradient>
                <RadialGradient id={`${uid}-cap`} cx="50%" cy="50%" r="60%">
                    <Stop offset="0" stopColor={shade(cap, 0.5)} />
                    <Stop offset="0.6" stopColor={cap} />
                    <Stop offset="1" stopColor={shade(cap, -0.25)} />
                </RadialGradient>
                <RadialGradient id={`${uid}-glow`}>
                    <Stop offset="0" stopColor={cap} stopOpacity={0.45} />
                    <Stop offset="1" stopColor={cap} stopOpacity={0} />
                </RadialGradient>
                <LinearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="#fff" stopOpacity={0} />
                    <Stop offset="0.5" stopColor="#fff" stopOpacity={0.32} />
                    <Stop offset="1" stopColor="#fff" stopOpacity={0} />
                </LinearGradient>
                <ClipPath id={`${uid}-top-clip`}>
                    <Ellipse cx={top.x} cy={top.y} rx={rx} ry={ry} />
                </ClipPath>
                <ClipPath id={`${uid}-body-clip`}>
                    <Ellipse cx={base.x} cy={base.y} rx={rx} ry={ry} />
                    <Rect x={x0} y={ceiling} width={rx * 2} height={base.y - ceiling} />
                </ClipPath>
            </Defs>

            <G clipPath={`url(#${uid}-body-clip)`}>
                <GrowsFrom y={base.y}>
                    <Rect x={x0 - 2} y={top.y} width={rx * 2 + 4} height={depth + ry + 2} fill={`url(#${uid}-side)`} />
                </GrowsFrom>
                <G transform={`translate(${base.x - c} ${top.y + ry})`}>
                    <Path d={bandPath} fill={`url(#${uid}-band)`} />
                    {face}
                </G>
            </G>

            <RidesOnWalls depth={depth}>
                {glow && <Ellipse cx={top.x} cy={top.y} rx={rx + 10} ry={ry + 8} fill={`url(#${uid}-glow)`} />}
                <Ellipse cx={top.x} cy={top.y} rx={rx} ry={ry} fill={`url(#${uid}-cap)`} />
                <G clipPath={`url(#${uid}-top-clip)`}>
                    <Ellipse cx={top.x - rx * 0.28} cy={top.y - ry * 0.32} rx={rx * 0.3} ry={ry * 0.2} fill="#fff" fillOpacity={0.35} />
                    {working && <Sweep x={top.x - geometry.halfW} y={top.y - geometry.halfH} width={geometry.halfW} height={geometry.halfH * 2} fill={`url(#${uid}-sweep)`} />}
                </G>
                <Ellipse cx={top.x} cy={top.y} rx={rx - 0.4} ry={ry - 0.4} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.8} />
            </RidesOnWalls>
        </>
    )
}
