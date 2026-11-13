'use client'

import { useLocale, useTranslations } from 'next-intl'

import type { ChannelThreadSummary } from '@/app/api/_services/work/channels.service'
import { MemberAvatar } from '@/components/channels/MemberAvatar'
import { refKey } from '@/components/channels/channel-rows'
import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import { shortRelativeTime } from '@/lib/time'

// The way into a thread from the channel: who answered, how many replies, how long ago.
export function ThreadSummary({ thread, directory, onOpen }: { thread: ChannelThreadSummary; directory: ChannelDirectory; onOpen: () => void }) {
    const t = useTranslations('channels.message')
    const locale = useLocale()
    return (
        <button type="button" onClick={onOpen} className="group/thread mt-1 -ml-1 flex max-w-full items-center gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-muted">
            <span className="flex shrink-0 -space-x-1">
                {thread.replyAuthors.map(author => (
                    <MemberAvatar key={refKey(author)} author={author} directory={directory} size="sm" className="ring-2 ring-background rounded-full" />
                ))}
            </span>
            <span className="font-medium text-foreground underline-offset-2 group-hover/thread:underline">{t('replies', { count: thread.replyCount })}</span>
            <span className="truncate text-muted-foreground">{shortRelativeTime(thread.lastReplyAt, locale)}</span>
        </button>
    )
}
