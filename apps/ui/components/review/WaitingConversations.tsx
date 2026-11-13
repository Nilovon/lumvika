'use client'

import { useOpenIssueConversation } from '@/components/issues/IssueWorkingBanner'
import { useConversationIssues } from '@/components/review/useConversationIssues'
import { EmptyState } from '@/components/ui/empty-state'
import type { AttentionSession } from '@/hooks/useAttentionSessions'
import { KanbanIcon, MessageSquareIcon } from '@/lib/icons'
import { STATUS_META } from '@/lib/board/attention'
import { useBoardStore } from '@/stores/board.store'
import { fullDateTime, shortRelativeTime } from '@lumvika/i18n/format'
import { AttentionBuddy } from '@lumvika/ui/inbox'
import { Badge } from '@lumvika/ui/primitives'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

const ASKS = ['awaiting_approval', 'awaiting_question', 'awaiting_connector', 'awaiting_ack', 'error', 'waiting_human'] as const
type Ask = (typeof ASKS)[number]

function askOf(status: string): Ask {
    return (ASKS as readonly string[]).includes(status) ? (status as Ask) : 'waiting_human'
}

// The coworker conversations that stopped on a question for the reader: the same list as the
// workspace inbox, each row opening its conversation on the board, and naming the issue the
// conversation works on when there is one.
export function WaitingConversations({ sessions, onOpenIssue }: { sessions: AttentionSession[]; onOpenIssue: (ref: string) => void }) {
    const t = useTranslations('review')
    const locale = useLocale()
    const agents = useBoardStore(state => state.agents)
    const openConversation = useOpenIssueConversation()
    const names = useMemo(() => new Map(agents.map(agent => [agent.id, agent.name])), [agents])
    const issues = useConversationIssues(sessions)

    if (sessions.length === 0) return <EmptyState icon={MessageSquareIcon} title={t('empty.conversations.title')} description={t('empty.conversations.description')} className="rounded-lg border border-dashed border-border py-12" />

    return (
        <ul className="overflow-hidden rounded-lg border border-border">
            {sessions.map(session => {
                const ask = askOf(session.status)
                const issue = issues.get(session.id)
                return (
                    <li key={session.id} className="border-b border-border last:border-b-0">
                        <button type="button" onClick={() => openConversation(session.agentId, session.id)} className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60">
                            <span className="shrink-0">
                                <AttentionBuddy agentId={session.agentId} status={session.status} />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="text-sm font-medium">{names.get(session.agentId) ?? ''}</span>
                                    <Badge size="xs" tone={STATUS_META[ask]?.tone ?? 'neutral'} glow={false} className="font-medium">
                                        {t(`asks.${ask}`)}
                                    </Badge>
                                </span>
                                <span className="truncate text-sm text-foreground/90">{session.title}</span>
                                {session.message && <span className="line-clamp-2 text-xs break-words text-muted-foreground">{session.message}</span>}
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-2">
                                {session.updatedAt && (
                                    <time dateTime={session.updatedAt} title={fullDateTime(session.updatedAt, locale)} className="text-xs text-muted-foreground tabular-nums">
                                        {shortRelativeTime(session.updatedAt, locale)}
                                    </time>
                                )}
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground max-sm:sr-only">
                                    <MessageSquareIcon className="size-3.5" />
                                    {t('conversation.open')}
                                </span>
                            </span>
                        </button>
                        {issue && (
                            <div className="-mt-1 px-3 pb-3 pl-14">
                                <button
                                    type="button"
                                    onClick={() => onOpenIssue(issue.ref)}
                                    aria-label={t('conversation.openIssue', { ref: issue.ref })}
                                    className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-left text-xs text-muted-foreground transition-colors outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <KanbanIcon className="size-3.5 shrink-0" />
                                    <span className="truncate">{t('conversation.issue', { ref: issue.ref, title: issue.title })}</span>
                                </button>
                            </div>
                        )}
                    </li>
                )
            })}
        </ul>
    )
}

