import { Host, Menu, RNHostView } from '@expo/ui/swift-ui'
import { accessibilityLabel, glassEffect } from '@expo/ui/swift-ui/modifiers'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import type { ReactElement, ReactNode } from 'react'
import { View } from 'react-native'

import { GLASS_BUTTON_SIZE } from '@/components/ui/GlassButton'
import { useTheme } from '@/theme/theme'

type NativeMenuProps = {
    trigger: ReactElement
    children: ReactNode
    // Draws the trigger as a system glass button of this shape.
    glass?: 'circle' | 'capsule'
    // Read by VoiceOver on a glass trigger, whose content lives in SwiftUI.
    label?: string
}

// A tap on `trigger` opens the system menu (UIMenu, in glass on iOS 26). Items are @expo/ui SwiftUI
// views: `Button` for an action, `Toggle` for a checked row, a nested `Menu` for a submenu.
export function NativeMenu({ trigger, children, glass, label }: NativeMenuProps) {
    const theme = useTheme()
    const modifiers = [...(glass ? [glassEffect({ glass: { variant: 'regular', interactive: true }, shape: glass })] : []), ...(label ? [accessibilityLabel(label)] : [])]
    return (
        <Host matchContents colorScheme={theme.scheme}>
            <Menu label={<RNHostView matchContents>{trigger}</RNHostView>} modifiers={modifiers}>
                {children}
            </Menu>
        </Host>
    )
}

// What a round glass trigger holds: an SF Symbol, or an avatar cut to the circle.
export function CircleTrigger({ symbol, children }: { symbol?: SFSymbol; children?: ReactNode }) {
    const theme = useTheme()
    return (
        <View style={{ width: GLASS_BUTTON_SIZE, height: GLASS_BUTTON_SIZE, borderRadius: GLASS_BUTTON_SIZE / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {symbol ? <SymbolView name={symbol} size={18} weight="medium" tintColor={theme.foreground} /> : children}
        </View>
    )
}
