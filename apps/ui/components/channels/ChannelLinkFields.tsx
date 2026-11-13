'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { listProjectsAction } from '@/app/api/_actions/projects.actions'
import { listTeamsAction } from '@/app/api/_actions/teams.actions'
import { Field } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type ChannelLinkValue = { projectId: string | null; teamId: string | null }
export type ChannelLinkOption = { id: string; label: string }
export type ChannelLinkOptions = { projects: ChannelLinkOption[] | null; teams: ChannelLinkOption[] | null }

const NONE = 'none'

// The projects the person sees (the server offers no other) and the teams of the workspace, read
// once when the fields show. A list that cannot be read offers only "none".
export function useChannelLinkOptions(enabled = true): ChannelLinkOptions {
    const [options, setOptions] = useState<ChannelLinkOptions>({ projects: null, teams: null })
    useEffect(() => {
        if (!enabled) return
        let active = true
        void Promise.all([listProjectsAction(), listTeamsAction()]).then(([projects, teams]) => {
            if (!active) return
            setOptions({
                projects: projects.ok ? projects.projects.filter(project => !project.archivedAt).map(project => ({ id: project.id, label: project.name })) : [],
                teams: teams.ok ? teams.teams.map(team => ({ id: team.id, label: team.name })) : [],
            })
        })
        return () => {
            active = false
        }
    }, [enabled])
    return options
}

function LinkSelect({ id, value, options, emptyLabel, disabled, onChange }: { id: string; value: string | null; options: ChannelLinkOption[] | null; emptyLabel: string; disabled?: boolean; onChange: (value: string | null) => void }) {
    const current = options?.find(option => option.id === value)
    return (
        <Select value={value ?? NONE} onValueChange={next => onChange(next === NONE ? null : next)} disabled={disabled || options === null}>
            <SelectTrigger id={id} className="w-full">
                <SelectValue>{value ? (current?.label ?? '…') : emptyLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper">
                <SelectItem value={NONE}>{emptyLabel}</SelectItem>
                {options?.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                        <span className="truncate">{option.label}</span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

// The project and the team a channel is about, each optional.
export function ChannelLinkFields({ idPrefix, value, options, disabled, onChange }: { idPrefix: string; value: ChannelLinkValue; options: ChannelLinkOptions; disabled?: boolean; onChange: (next: Partial<ChannelLinkValue>) => void }) {
    const t = useTranslations('channels.links')
    return (
        <>
            <Field label={t('project')} optional htmlFor={`${idPrefix}-project`}>
                <LinkSelect id={`${idPrefix}-project`} value={value.projectId} options={options.projects} emptyLabel={t('noProject')} disabled={disabled} onChange={projectId => onChange({ projectId })} />
            </Field>
            <Field label={t('team')} optional htmlFor={`${idPrefix}-team`}>
                <LinkSelect id={`${idPrefix}-team`} value={value.teamId} options={options.teams} emptyLabel={t('noTeam')} disabled={disabled} onChange={teamId => onChange({ teamId })} />
            </Field>
        </>
    )
}
