import type { ReactNode } from 'react'
import { Circle, G, Path, Rect } from 'react-native-svg'

import type { BuddyEyes, BuddyMood, BuddyMouth } from './look'
import { Blinking } from './motion'

// Ported from packages/ui/src/iso-grid/components/buddy/BuddyFace.tsx.
// Drawn on the lantern's window band, in the face's own plane: the face is centred on x = 21, the
// eyes 10 units apart. Every shape is flat ink on the light band, without sockets or glow.
const CENTER = 21
export const BUDDY_FACE_CENTER = CENTER
const GAP = 5
const INK = '#10201D'
const PAPER = '#F7F4EC'
const HEART = '#e0366f'
const SPARK = '#F5A524'

type EyeProps = { x: number; y: number }

function Pair({ y, children }: { y: number; children: (eye: EyeProps) => ReactNode }) {
    return <>{[CENTER - GAP, CENTER + GAP].map(x => <G key={x}>{children({ x, y })}</G>)}</>
}

function closed(x: number, y: number, color = INK) {
    return <Path d={`M${x - 2.6} ${y} Q${x} ${y + 2.3} ${x + 2.6} ${y}`} stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" />
}

function cross(x: number, y: number, color = INK) {
    return <Path d={`M${x - 2.2} ${y - 2.2} L${x + 2.2} ${y + 2.2} M${x + 2.2} ${y - 2.2} L${x - 2.2} ${y + 2.2}`} stroke={color} strokeWidth={1.7} strokeLinecap="round" />
}

function star(x: number, y: number, r: number) {
    const i = r * 0.36
    return `M${x} ${y - r} L${x + i} ${y - i} L${x + r} ${y} L${x + i} ${y + i} L${x} ${y + r} L${x - i} ${y + i} L${x - r} ${y} L${x - i} ${y - i} Z`
}

type EyesProps = { style: BuddyEyes; mood: BuddyMood; y: number; light: string }

function Eyes({ style, mood, y: baseY, light }: EyesProps) {
    if (mood === 'asleep') return <Pair y={baseY}>{({ x, y }) => closed(x, y)}</Pair>
    // Glasses and visors keep their frame when broken; everything else shows the crossed eyes.
    if (mood === 'error' && style !== 'visor' && style !== 'shades' && style !== 'glasses') return <Pair y={baseY}>{({ x, y }) => cross(x, y)}</Pair>

    const lookX = mood === 'working' ? 1 : 0
    const lookY = mood === 'waiting' ? -1.4 : mood === 'working' ? 0.8 : 0
    const y = baseY + lookY
    const at = (x: number) => x + lookX

    switch (style) {
        case 'pill':
            return <Blinking y={y}><Pair y={y}>{e => <Rect x={at(e.x) - 1.8} y={e.y - 3.4} width={3.6} height={6.8} rx={1.8} fill={INK} />}</Pair></Blinking>
        case 'round':
            return <Blinking y={y}><Pair y={y}>{e => <Circle cx={at(e.x)} cy={e.y} r={2.6} fill={INK} />}</Pair></Blinking>
        case 'dot':
            return <Blinking y={y}><Pair y={y}>{e => <Circle cx={at(e.x)} cy={e.y} r={1.5} fill={INK} />}</Pair></Blinking>
        case 'happy':
            return <Pair y={y}>{e => <Path d={`M${at(e.x) - 3} ${e.y + 1.2} Q${at(e.x)} ${e.y - 3} ${at(e.x) + 3} ${e.y + 1.2}`} stroke={INK} strokeWidth={1.8} strokeLinecap="round" fill="none" />}</Pair>
        case 'line':
            return <Pair y={y}>{e => <Path d={`M${at(e.x) - 2.8} ${e.y} L${at(e.x) + 2.8} ${e.y}`} stroke={INK} strokeWidth={1.8} strokeLinecap="round" />}</Pair>
        case 'googly':
            return (
                <G>
                    <Pair y={y}>{e => <Circle cx={e.x} cy={e.y} r={3.9} fill="#fff" stroke={INK} strokeWidth={1.1} />}</Pair>
                    <G>
                        <Pair y={y}>{e => <Circle cx={e.x + lookX * 0.8} cy={e.y + 0.5 + lookY * 0.5} r={1.8} fill={INK} />}</Pair>
                    </G>
                </G>
            )
        case 'cyclops':
            return (
                <Blinking y={y}>
                    <Circle cx={CENTER} cy={y} r={4.8} fill="#fff" stroke={INK} strokeWidth={1.2} />
                    <Circle cx={CENTER + lookX} cy={y + 0.4 + lookY * 0.5} r={2.3} fill={INK} />
                </Blinking>
            )
        case 'visor':
            return (
                <G>
                    <Rect x={CENTER - 11} y={y - 2.8} width={22} height={5.6} rx={2.8} fill={INK} />
                    {mood === 'error' ? (
                        <Pair y={y}>{e => cross(e.x, e.y, light)}</Pair>
                    ) : (
                        <Blinking y={y}><Rect x={at(CENTER) - 7} y={y - 0.8} width={5} height={1.6} rx={0.8} fill={light} /></Blinking>
                    )}
                </G>
            )
        case 'shades':
            return (
                <G>
                    <Path d={`M${CENTER - 2} ${y - 1.2} L${CENTER + 2} ${y - 1.2}`} stroke={INK} strokeWidth={1.3} />
                    <Pair y={y}>{e => <Path d={`M${e.x - 3.6} ${e.y - 2.4} L${e.x + 3.6} ${e.y - 2.4} L${e.x + 3} ${e.y + 1.4} Q${e.x} ${e.y + 3.4} ${e.x - 3} ${e.y + 1.4} Z`} fill={INK} />}</Pair>
                    {mood === 'error' && <Path d={`M${CENTER - 3} ${y + 5.4} q3 -1.6 6 0`} stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />}
                </G>
            )
        case 'glasses':
            return (
                <G>
                    <Path d={`M${CENTER - 1.6} ${y - 0.4} L${CENTER + 1.6} ${y - 0.4}`} stroke={INK} strokeWidth={1.1} />
                    <Pair y={y}>{e => <Rect x={e.x - 3.4} y={e.y - 3} width={6.8} height={6} rx={1.6} fill="none" stroke={INK} strokeWidth={1.1} />}</Pair>
                    {mood === 'error' ? <Pair y={y}>{e => cross(e.x, e.y)}</Pair> : <Blinking y={y}><Pair y={y}>{e => <Circle cx={at(e.x)} cy={e.y + lookY * 0.3} r={1.3} fill={INK} />}</Pair></Blinking>}
                </G>
            )
        case 'sleepy':
            return <Pair y={y}>{e => <Path d={`M${at(e.x) - 2.6} ${e.y - 0.4} L${at(e.x) + 2.6} ${e.y - 0.4} A2.6 2.6 0 0 1 ${at(e.x) - 2.6} ${e.y - 0.4} Z`} fill={INK} />}</Pair>
        case 'wink':
            return (
                <G>
                    <Rect x={at(CENTER - GAP) - 1.8} y={y - 3.4} width={3.6} height={6.8} rx={1.8} fill={INK} />
                    <Path d={`M${at(CENTER + GAP) - 2.8} ${y + 0.8} L${at(CENTER + GAP) + 2.8} ${y - 0.8}`} stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
                </G>
            )
        case 'pixel':
            return <Blinking y={y}><Pair y={y}>{e => <Rect x={at(e.x) - 2.2} y={e.y - 2.2} width={4.4} height={4.4} fill={INK} />}</Pair></Blinking>
        case 'star':
            return <Pair y={y}>{e => <Path d={star(at(e.x), e.y, 3.4)} fill={INK} />}</Pair>
        case 'heart':
            return (
                <Pair y={y}>
                    {e => (
                        <Path
                            d={`M${at(e.x)} ${e.y + 2.8} C${at(e.x) - 4.6} ${e.y - 0.4} ${at(e.x) - 2.8} ${e.y - 3.9} ${at(e.x)} ${e.y - 1.5} C${at(e.x) + 2.8} ${e.y - 3.9} ${at(e.x) + 4.6} ${e.y - 0.4} ${at(e.x)} ${e.y + 2.8} Z`}
                            fill={HEART}
                        />
                    )}
                </Pair>
            )
        case 'brows':
            return (
                <G>
                    <Path d={`M${CENTER - GAP - 2.8} ${y - 4.4} L${CENTER - GAP + 2.4} ${y - 5.4}`} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
                    <Path d={`M${CENTER + GAP + 2.8} ${y - 4.4} L${CENTER + GAP - 2.4} ${y - 5.4}`} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
                    <Blinking y={y}><Pair y={y}>{e => <Circle cx={at(e.x)} cy={e.y + 0.6} r={2.2} fill={INK} />}</Pair></Blinking>
                </G>
            )
        case 'sparkle':
            return (
                <G>
                    <Blinking y={y}><Pair y={y}>{e => <Rect x={at(e.x) - 1.9} y={e.y - 3.4} width={3.8} height={6.8} rx={1.9} fill={INK} />}</Pair></Blinking>
                    <Path d={star(CENTER + GAP + 4.6, y - 4, 2)} fill={SPARK} />
                </G>
            )
    }
}

function Mouth({ mouth, mood, y }: { mouth: BuddyMouth; mood: BuddyMood; y: number }) {
    if (mood === 'error') return <Path d={`M${CENTER - 2.6} ${y + 0.9} Q${CENTER} ${y - 1.3} ${CENTER + 2.6} ${y + 0.9}`} stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />
    if (mood === 'waiting') return <Circle cx={CENTER} cy={y} r={1.4} fill="none" stroke={INK} strokeWidth={1.1} />
    switch (mouth) {
        case 'smile':
            return <Path d={`M${CENTER - 2.6} ${y - 0.6} Q${CENTER} ${y + 2} ${CENTER + 2.6} ${y - 0.6}`} stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />
        case 'open':
            return <Path d={`M${CENTER - 2.2} ${y - 0.8} Q${CENTER} ${y + 3} ${CENTER + 2.2} ${y - 0.8} Z`} fill={INK} />
        case 'cat':
            return <Path d={`M${CENTER - 3} ${y - 0.4} Q${CENTER - 1.5} ${y + 1.7} ${CENTER} ${y - 0.4} Q${CENTER + 1.5} ${y + 1.7} ${CENTER + 3} ${y - 0.4}`} stroke={INK} strokeWidth={1.2} strokeLinecap="round" fill="none" />
        case 'flat':
            return <Path d={`M${CENTER - 2} ${y} L${CENTER + 2} ${y}`} stroke={INK} strokeWidth={1.3} strokeLinecap="round" />
        case 'none':
            return null
    }
}

type BuddyFaceProps = {
    uid: string
    eyes: BuddyEyes
    mouth: BuddyMouth
    mood: BuddyMood
    depth: number
    // The light in a visor's slit.
    light: string
    // Kept for callers that tell a full-size face from a tiny one; the flat face reads at any size.
    lit: boolean
    tint: string
}

export function BuddyFace({ eyes, mouth, mood, depth, light }: BuddyFaceProps) {
    const hasMouth = mouth !== 'none' || mood === 'error' || mood === 'waiting'
    const eyeY = depth * (hasMouth ? 0.34 : 0.47)
    return (
        <>
            <Eyes style={eyes} mood={mood} y={eyeY} light={light === '#fff' ? PAPER : light} />
            {hasMouth && mood !== 'asleep' && <Mouth mouth={mouth} mood={mood} y={eyeY + 6.6} />}
        </>
    )
}
