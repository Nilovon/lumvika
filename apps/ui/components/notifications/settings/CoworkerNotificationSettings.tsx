'use client'

import type { CoworkerRule, NotificationPrefs, NotificationPrefsPatch } from '@/lib/notifications/prefs'
import type { ReactNode } from 'react'

import { CoworkerRules, type CoworkerOption, type CoworkerPickerProps } from './CoworkerRules'
import { NotificationChannels } from './NotificationChannels'
import { ScopeRadioList } from './ScopeRadioList'

type CoworkerNotificationSettingsProps = {
    prefs: NotificationPrefs
    coworkers: CoworkerOption[]
    onUpdate: (patch: NotificationPrefsPatch) => void
    onSetCoworkerRule: (agentId: string, rule: CoworkerRule) => void
    pinnedCoworkerId?: string | null
    renderPicker: (props: CoworkerPickerProps) => ReactNode
}

export function CoworkerNotificationSettings({ prefs, coworkers, onUpdate, onSetCoworkerRule, pinnedCoworkerId, renderPicker }: CoworkerNotificationSettingsProps) {
    return (
        <div className="flex flex-col gap-6">
            <ScopeRadioList scope={prefs.scope} onChange={scope => onUpdate({ scope })} />
            <NotificationChannels prefs={prefs} onChange={onUpdate} />
            <CoworkerRules coworkers={coworkers} rules={prefs.coworkers} onChange={onSetCoworkerRule} pinnedId={pinnedCoworkerId} renderPicker={renderPicker} />
        </div>
    )
}
