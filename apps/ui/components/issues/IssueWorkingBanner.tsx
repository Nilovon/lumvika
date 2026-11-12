'use client'

import { useWorkMembers } from '@/components/issues/useWorkMembers'
import { Button } from '@/components/ui/button'
import { MessageSquareIcon } from '@/lib/icons'
import { useBoardStore } from '@/stores/board.store'
import { PAUSED_ON_PERSON_STATUSES, type IssueDetail } from '@lumvika/contracts'
import { shortRelativeTime } from '@lumvika/i18n/format'
import { AgentBuddy } from '@lumvika/ui/iso-grid'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

// The conversation in which the coworker works on the issue opens on the board, in its panel: the
// same way a notification opens one.
export function useOpenIssueConversation() {
    const router = useRouter()
    return (agentId: string, sessionId: string) => {
        useBoardStore.getState().setPendingOpenSession({ agentId, sessionId, runId: null })
        router.push(`/?agent=${encodeURIComponent(agentId)}&tab=chat`)
    }
}

const PAUSED_ON_PERSON = new Set<string>(PAUSED_ON_PERSON_STATUSES)

// Shown while a coworker holds the issue, and whenever there is a conversation to go back to. When
// that conversation stopped on a question for a person, it says so: the issue waits on their answer
// there, not on the coworker.
export function IssueWorkingBanner({ issue }: { issue: IssueDetail }) {
    const t = useTranslations('issues.detail')
    const locale = useLocale()
    const { labelOf } = useWorkMembers()
    const openConversation = useOpenIssueConversation()
    const agentId = issue.assignee?.kind === 'agent' ? issue.assignee.agentId : null
    const waiting = useBoardStore(state => !!issue.sessionId && state.sessions.some(session => session.id === issue.sessionId && PAUSED_ON_PERSON.has(session.status)))
    const working = !!issue.checkoutRunId && !!agentId && !waiting
    if (!agentId || (!working && !waiting && !issue.sessionId)) return null
    const name = labelOf(issue.assignee)?.name ?? ''

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <AgentBuddy agentId={agentId} size={28} mood={working ? 'working' : 'idle'} animated={working} facing="right" className="shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{waiting ? t('waitingOnPerson', { name }) : working ? t('working', { name }) : t('assignedTo', { name })}</span>
                {waiting && <span className="text-xs text-muted-foreground">{t('waitingOnPersonHint')}</span>}
                {working && issue.checkedOutAt && <span className="text-xs text-muted-foreground">{t('workingSince', { time: shortRelativeTime(issue.checkedOutAt, locale) })}</span>}
            </div>
            {issue.sessionId && (
                <Button type="button" size="sm" variant={waiting ? 'default' : 'outline'} onClick={() => openConversation(agentId, issue.sessionId as string)} className="max-sm:w-full">
                    <MessageSquareIcon />
                    {t('openConversation')}
                </Button>
            )}
        </div>
    )
}
