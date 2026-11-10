import { Button, Host, Image } from '@expo/ui/swift-ui'
import { accessibilityLabel, buttonBorderShape, buttonStyle, disabled as disabledModifier, font, frame } from '@expo/ui/swift-ui/modifiers'
import type { SFSymbol } from 'expo-symbols'
import { createContext, use } from 'react'

import { useTheme } from '@/theme/theme'

export const GLASS_BUTTON_SIZE = 44
// What `.buttonStyle(.glass)` pads around its label, on each side: a label framed `size - 2 × inset` gives a button of `size`.
export const GLASS_INSET = 7

// Glass does not render under a parent faded below full opacity: a layer that fades in and out
// switches it off while hidden and lets it come back natively.
export const GlassShown = createContext(true)

export function useGlassStyle() {
    const shown = use(GlassShown)
    return { style: shown ? 'regular' : 'none', animate: true, animationDuration: 0.25 } as const
}

type GlassButtonProps = {
    symbol: SFSymbol
    label: string
    onPress: () => void
    disabled?: boolean
    size?: number
    // Forces the glass's scheme over a backdrop that ignores the theme, like the black of the viewer.
    scheme?: 'light' | 'dark'
}

// The system's own glass button (SwiftUI `.buttonStyle(.glass)`), round, with an SF Symbol.
export function GlassButton({ symbol, label, onPress, disabled = false, size = GLASS_BUTTON_SIZE, scheme }: GlassButtonProps) {
    const theme = useTheme()
    const colorScheme = scheme ?? theme.scheme
    return (
        <Host matchContents colorScheme={colorScheme}>
            <Button onPress={onPress} modifiers={[buttonStyle('glass'), buttonBorderShape('circle'), disabledModifier(disabled), accessibilityLabel(label)]}>
                <Image systemName={symbol} color={colorScheme === 'dark' ? '#fafafa' : theme.foreground} modifiers={[font({ size: Math.round(size * 0.4), weight: 'medium' }), frame({ width: size - 2 * GLASS_INSET, height: size - 2 * GLASS_INSET })]} />
            </Button>
        </Host>
    )
}
