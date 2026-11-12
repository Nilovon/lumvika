'use client'

import type { WorkAuthor } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'

// The name an author signs with: a person of the directory (unnamed ones read as a teammate, those no
// longer in it as a former member), a coworker by its name, and nobody for a message without author.
export function useAuthorName(directory: ChannelDirectory) {
    const t = useTranslations('channels.message')
    return useCallback(
        (author: WorkAuthor): string => {
            if (author.kind === 'agent') return directory.coworker(author.agentId)?.name ?? t('coworker')
            if (author.kind === 'user') {
                if (!directory.people) return '…'
                const person = directory.person(author.userId)
                if (!person) return t('formerMember')
                return person.name ?? t('unnamed')
            }
            return t('someone')
        },
        [directory, t]
    )
}
