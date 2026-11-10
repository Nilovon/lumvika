import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

import { useTheme } from '@/theme/theme'

// The background fading in at a screen edge, so content scrolling under a floating bar dissolves
// instead of being cut.
export function EdgeFade({ edge, height }: { edge: 'top' | 'bottom'; height: number }) {
    const theme = useTheme()
    const id = `fade-${edge}`
    return (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, edge === 'top' ? { bottom: undefined } : { top: undefined }, { height }]}>
            <Svg width="100%" height="100%">
                <Defs>
                    <LinearGradient id={id} x1="0" y1={edge === 'top' ? '0' : '1'} x2="0" y2={edge === 'top' ? '1' : '0'}>
                        <Stop offset="0" stopColor={theme.background} stopOpacity={1} />
                        <Stop offset="0.55" stopColor={theme.background} stopOpacity={0.85} />
                        <Stop offset="1" stopColor={theme.background} stopOpacity={0} />
                    </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#${id})`} />
            </Svg>
        </View>
    )
}
