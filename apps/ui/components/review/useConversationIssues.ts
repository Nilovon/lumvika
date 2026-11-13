'use client'

import { listConversationIssuesAction } from '@/app/api/_actions/review.actions'
import type { AttentionSession } from '@/hooks/useAttentionSessions'
import type { ConversationIssue } from '@/app/api/_services/work/review.service'
import { useEffect, useMemo, useState } from 'react'

// The issue each waiting conversation works on, by conversation id. A conversation that works on no
// issue, or on one of a project the reader does not see, has none; a failed read shows none.
export function useConversationIssues(sessions: readonly AttentionSession[]): Map<string, ConversationIssue> {
    const key = useMemo(() => [...new Set(sessions.map(session => session.id))].sort().join(','), [sessions])
    const [issues, setIssues] = useState<Map<string, ConversationIssue>>(new Map())

    useEffect(() => {
        if (!key) return
        let cancelled = false
        void listConversationIssuesAction(key.split(',')).then(result => {
            if (!cancelled && result.ok) setIssues(new Map(result.issues.map(issue => [issue.sessionId, issue])))
        })
        return () => {
            cancelled = true
        }
    }, [key])

    return issues
}
