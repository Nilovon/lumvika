import { searchConversationsAction } from '@/app/api/_actions/session.actions'
import type { ConversationHit } from '@/app/api/_services/conversation.service'
import { useEffect, useState } from 'react'

const DEBOUNCE_MS = 250

type Answer = { text: string; agentId: string | null; hits: ConversationHit[] }

const NO_ANSWER: Answer = { text: '', agentId: null, hits: [] }

// `text` and `agentId` are the only inputs on purpose: a callback or an object in the deps would
// re-run the action on every render.
export function useConversationSearch(text: string, agentId: string | null, enabled: boolean): { hits: ConversationHit[]; loading: boolean } {
    const [answer, setAnswer] = useState<Answer | null>(null)

    useEffect(() => {
        if (!enabled) return
        let stale = false
        const timer = setTimeout(() => {
            void searchConversationsAction(text, agentId ?? undefined).then(hits => {
                if (!stale) setAnswer({ text, agentId, hits })
            })
        }, DEBOUNCE_MS)
        return () => {
            stale = true
            clearTimeout(timer)
        }
    }, [text, agentId, enabled])

    if (!enabled) return { hits: [], loading: false }

    // The previous answer stays on screen while the next one loads, as long as it is about the
    // same agent: the list refines under the cursor instead of blinking.
    const shown = answer && answer.agentId === agentId ? answer : NO_ANSWER
    return { hits: shown.hits, loading: answer?.text !== text || answer.agentId !== agentId }
}
