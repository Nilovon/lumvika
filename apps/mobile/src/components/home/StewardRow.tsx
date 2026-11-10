import { STEWARD_AGENT_ID } from '@lumvika/contracts'
import { Pressable, View } from 'react-native'
import { useTranslations } from 'use-intl'

import { HOME_GUTTER, ROW_TITLE } from '@/components/home/CoworkerRow'
import type { StewardLast } from '@/components/home/useStewardLast'
import { AppText } from '@/components/ui/AppText'
import { CoworkerAvatar } from '@/components/ui/CoworkerAvatar'
import { useTheme } from '@/theme/theme'
import { spacing } from '@/theme/tokens'

const ORB = 52

// The Steward on its own at the top of the Home, the way Grok sets its own entries above the
// conversations: a larger orb, no pin, no time, its last conversation under its name.
export function StewardRow({ last, selected = false, onPress }: { last: StewardLast; selected?: boolean; onPress: () => void }) {
    const theme = useTheme()
    const t = useTranslations('mobileHome')
    const line = last.title || t('steward.askAnything')
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t('row.label', { name: 'Lumvika', line })} accessibilityHint={t('row.opensConversation')} accessibilityState={{ selected }} style={selected ? { backgroundColor: theme.muted } : undefined}>
            {({ pressed }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: HOME_GUTTER, opacity: pressed ? 0.6 : 1 }}>
                    <CoworkerAvatar coworker={{ id: STEWARD_AGENT_ID, kind: 'steward', status: last.running ? 'working' : 'idle' }} size={ORB} facing="right" />
                    <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="headline" numberOfLines={1} maxFontSizeMultiplier={1.4} style={ROW_TITLE}>
                            Lumvika
                        </AppText>
                        <AppText variant="callout" tone="muted" numberOfLines={1} maxFontSizeMultiplier={1.4}>
                            {line}
                        </AppText>
                    </View>
                </View>
            )}
        </Pressable>
    )
}
