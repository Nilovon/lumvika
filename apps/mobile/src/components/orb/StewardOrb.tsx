import { useEffect, useId, type ComponentType } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { Easing, cancelAnimation, useAnimatedProps, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, type GProps } from 'react-native-svg'

import { BUDDY_FACE_CENTER, BuddyFace } from '@/components/buddy/BuddyFace'
import { BuddyMotionScope } from '@/components/buddy/motion'
import { ORB_BELLY as BELLY, ORB_CENTER as CENTER, ORB_RADIUS as RADIUS, advance, restingPose, startClock, type Matrix } from '@/components/orb/orb-motion'

// Ported from packages/ui/src/steward (Orb, StewardBall, the `glass` material): the Steward is a
// mint drop of light with two ink eyes set straight into it. Like on the web, its eyes drift, the
// drop turns as if looking around, a band of light crosses it, and it bounces and spins while it
// thinks.

export type OrbState = 'idle' | 'thinking'

// G takes a `matrix` and hands it to the native group as is; its typings only list the shorthands.
const AnimatedG = Animated.createAnimatedComponent(G as ComponentType<GProps & { matrix?: Matrix }>)

const FLOOR = CENTER.y + RADIUS
const MARGIN = 2
const BELOW_FLOOR = 5
const VIEW_WIDTH = RADIUS * 2 + MARGIN * 2
const VIEW_HEIGHT = RADIUS * 2 + MARGIN + BELOW_FLOOR

const SMALL_BELOW = 40
const FACE_SCALE = 1.3
const SMALL_FACE_SCALE = 1.6
const EYE_Y = 10
const FACE_EYE_SHARE = 0.45
const SHEEN_WIDTH = 20

const LUMEN = {
    stops: [
        [0, '#fcfff2'],
        [0.35, '#eefbc4'],
        [0.7, '#c6f432'],
        [1, '#5c7f00'],
    ] as const,
    outline: '#3d5400',
    aura: '#c6f432',
    eyeTint: '#0a0a0a',
    eyeLight: '#ffffff',
}

const TIP = CENTER.y - RADIUS
const DROP_PATH = (() => {
    const reach = Math.acos(BELLY.r / (BELLY.y - TIP))
    const dx = BELLY.r * Math.sin(reach)
    const y = BELLY.y - BELLY.r * Math.cos(reach)
    const f = (n: number) => n.toFixed(2)
    return `M${f(CENTER.x)} ${f(TIP)} C${f(CENTER.x + 6)} ${f(TIP + 14)} ${f(CENTER.x + dx)} ${f(y - 6)} ${f(CENTER.x + dx)} ${f(y)} A${BELLY.r} ${BELLY.r} 0 1 1 ${f(CENTER.x - dx)} ${f(y)} C${f(CENTER.x - dx)} ${f(y - 6)} ${f(CENTER.x - 6)} ${f(TIP + 14)} ${f(CENTER.x)} ${f(TIP)} Z`
})()

const MOTION: Record<OrbState, { amp: number; period: number }> = {
    idle: { amp: 0, period: 0 },
    thinking: { amp: 0.09, period: 1.1 },
}

type StewardOrbProps = {
    // Diameter of the ball in points; its shadow spills a little under it.
    size: number
    state?: OrbState
    facing?: 'left' | 'right'
    animated?: boolean
    // Holds the ball still in its resting pose, for one that is out of sight.
    paused?: boolean
    style?: StyleProp<ViewStyle>
}

export function StewardOrb({ size, state = 'idle', facing = 'left', animated = true, paused = false, style }: StewardOrbProps) {
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
    const reducedMotion = useReducedMotion()
    const small = size < SMALL_BELOW
    const faceScale = small ? SMALL_FACE_SCALE : FACE_SCALE
    const motion = MOTION[state]
    const moving = animated && !reducedMotion && motion.amp > 0

    const phase = useSharedValue(0)
    useEffect(() => {
        if (!moving) {
            cancelAnimation(phase)
            phase.value = 0
            return
        }
        phase.value = withRepeat(withTiming(1, { duration: (motion.period * 1000) / 2, easing: Easing.inOut(Easing.quad) }), -1, true)
    }, [moving, motion.period, phase])

    const living = animated && !paused && !reducedMotion
    const thinking = state === 'thinking'
    const clock = useSharedValue(startClock())
    const pose = useSharedValue(restingPose(facing))
    const lifeInput = useSharedValue({ thinking, facing })
    useEffect(() => {
        lifeInput.value = { thinking, facing }
    }, [thinking, facing, lifeInput])
    const life = useFrameCallback(frame => {
        const dt = Math.min((frame.timeSincePreviousFrame ?? 16) / 1000, 0.05)
        const { thinking: busy, facing: side } = lifeInput.value
        clock.modify(current => {
            'worklet'
            pose.value = advance(current, dt, busy, side)
            return current
        }, false)
    }, false)
    useEffect(() => {
        life.setActive(living)
        // A ball stopped halfway through a spin would be left without a face.
        if (!living) pose.set(restingPose(facing))
    }, [living, facing, life, pose])

    const faceProps = useAnimatedProps(() => ({ matrix: pose.value.face, opacity: pose.value.faceShown ? 1 : 0 }))
    const eyesProps = useAnimatedProps(() => ({ matrix: pose.value.eyes }))
    const sheenProps = useAnimatedProps(() => ({ matrix: pose.value.sheen }))

    const width = (size * VIEW_WIDTH) / (RADIUS * 2)
    const height = (size * VIEW_HEIGHT) / (RADIUS * 2)
    const bounce = useAnimatedStyle(() => {
        const amp = motion.amp
        const lift = phase.value
        return {
            transform: [
                { translateY: (-lift * amp * 170 * width) / VIEW_WIDTH },
                { scaleX: 1 + amp * 0.7 - lift * amp },
                { scaleY: 1 - amp * 0.7 + lift * amp },
            ],
        }
    })
    const shadow = useAnimatedStyle(() => {
        const amp = motion.amp
        const lift = phase.value
        return { opacity: 1 - lift * 0.45, transform: [{ scale: 1 + amp * 0.7 - lift * amp * 3.7 }] }
    })

    const inset = (size * MARGIN) / (RADIUS * 2)
    const viewBox = `${CENTER.x - VIEW_WIDTH / 2} ${CENTER.y - RADIUS - MARGIN} ${VIEW_WIDTH} ${VIEW_HEIGHT}`
    const fromFloor: ViewStyle = { position: 'absolute', left: -inset, top: -inset, width, height, transformOrigin: ['50%', `${((FLOOR - (CENTER.y - RADIUS - MARGIN)) / VIEW_HEIGHT) * 100}%`, 0] }

    return (
        <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
            <Animated.View style={[fromFloor, shadow]}>
                <Svg viewBox={viewBox} width={width} height={height}>
                    <Defs>
                        <RadialGradient id={`${uid}-aura`}>
                            <Stop offset="0" stopColor={LUMEN.aura} stopOpacity={0.5} />
                            <Stop offset="1" stopColor={LUMEN.aura} stopOpacity={0} />
                        </RadialGradient>
                        <RadialGradient id={`${uid}-shadow`}>
                            <Stop offset="0" stopColor="#000" stopOpacity={0.45} />
                            <Stop offset="1" stopColor="#000" stopOpacity={0} />
                        </RadialGradient>
                    </Defs>
                    <Ellipse cx={CENTER.x} cy={FLOOR - 1} rx={BELLY.r * 1.25} ry={BELLY.r * 0.32} fill={`url(#${uid}-aura)`} />
                    <Ellipse cx={CENTER.x} cy={FLOOR} rx={BELLY.r * 0.72} ry={BELOW_FLOOR - 1} fill={`url(#${uid}-shadow)`} />
                </Svg>
            </Animated.View>
            <Animated.View style={[fromFloor, bounce]}>
                <Svg viewBox={viewBox} width={width} height={height}>
                    <Defs>
                        <RadialGradient id={`${uid}-body`} cx={BELLY.x - 12} cy={BELLY.y - 14} r={BELLY.r * 1.7} gradientUnits="userSpaceOnUse">
                            {LUMEN.stops.map(([offset, color]) => (
                                <Stop key={offset} offset={offset} stopColor={color} />
                            ))}
                        </RadialGradient>
                        <LinearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor="#fff" stopOpacity={0} />
                            <Stop offset="0.5" stopColor="#fff" stopOpacity={0.55} />
                            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
                        </LinearGradient>
                        <ClipPath id={`${uid}-clip`}>
                            <Path d={DROP_PATH} />
                        </ClipPath>
                    </Defs>

                    <Path d={DROP_PATH} fill={`url(#${uid}-body)`} />
                    <G clipPath={`url(#${uid}-clip)`}>
                        {living && (
                            <G transform="skewX(-18)">
                                <AnimatedG animatedProps={sheenProps}>
                                    <Rect x={CENTER.x - RADIUS - SHEEN_WIDTH - 4} y={CENTER.y - RADIUS} width={SHEEN_WIDTH} height={RADIUS * 2} fill={`url(#${uid}-sheen)`} />
                                </AnimatedG>
                            </G>
                        )}
                        <AnimatedG animatedProps={faceProps}>
                            <G transform={`scale(${faceScale}) translate(${-BUDDY_FACE_CENTER} ${-EYE_Y})`}>
                                <AnimatedG animatedProps={eyesProps}>
                                    <BuddyMotionScope motion={animated && !reducedMotion ? { kind: null, offset: 0, blinkOffset: 1.3 } : null}>
                                        <BuddyFace uid={uid} eyes="pill" mouth="none" mood={thinking ? 'working' : 'idle'} depth={EYE_Y / FACE_EYE_SHARE} light={LUMEN.eyeLight} lit={!small} tint={LUMEN.eyeTint} />
                                    </BuddyMotionScope>
                                </AnimatedG>
                            </G>
                        </AnimatedG>
                    </G>
                    <Path d={DROP_PATH} fill="none" stroke={LUMEN.outline} strokeOpacity={0.45} strokeWidth={0.8} />
                </Svg>
            </Animated.View>
        </View>
    )
}

