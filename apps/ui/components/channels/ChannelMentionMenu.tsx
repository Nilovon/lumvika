'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { MemberAvatar } from '@/components/channels/MemberAvatar'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import type { MentionCandidate } from '@/components/channels/useChannelMentions'
import { cn } from '@/lib/utils'

type ChannelMentionMenuProps = {
    items: MentionCandidate[]
    highlight: number
    directory: ChannelDirectory
    onHover: (index: number) => void
    onPick: (candidate: MentionCandidate) => void
}

export function ChannelMentionMenu({ items, highlight, directory, onHover, onPick }: ChannelMentionMenuProps) {
    const t = useTranslations('channels.composer')
    const listRef = useRef<HTMLUListElement>(null)

    // Nudges the list's own scroll: scrollIntoView would drag the whole pane along.
    useEffect(() => {
        const list = listRef.current
        const row = list?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
        if (!list || !row) return
        if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop
        else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight
    }, [highlight])

    const firstCoworker = items.findIndex(item => item.ref.kind === 'agent')

    return (
        <div className="absolute right-0 bottom-full left-0 z-50 mb-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
            <ul ref={listRef} role="listbox" className="relative max-h-60 overflow-y-auto p-1">
                {items.map((item, index) => (
                    <li key={item.ref.kind === 'user' ? `user:${item.ref.userId}` : `agent:${item.ref.agentId}`} data-index={index}>
                        {(index === 0 || index === firstCoworker) && <p className="px-2 pt-1.5 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{item.ref.kind === 'user' ? t('mentionPeople') : t('mentionCoworkers')}</p>}
                        <button
                            type="button"
                            role="option"
                            aria-selected={index === highlight}
                            className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm', index === highlight && 'bg-accent text-accent-foreground')}
                            onMouseEnter={() => onHover(index)}
                            onMouseDown={event => {
                                event.preventDefault()
                                onPick(item)
                            }}
                        >
                            <MemberAvatar author={item.ref} directory={directory} size="sm" />
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">@{item.label}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}
