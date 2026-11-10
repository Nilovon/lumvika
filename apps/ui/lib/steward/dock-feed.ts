import { pendingApprovals, pendingQuestions } from '@lumvika/contracts'

import { liveActivityLabel, type LiveActivityCopy } from '@/lib/agent-chat-loader'

import { isEngineHitl, type PendingWidget } from './pending-widget'

export type StewardDockReply = { id: string; text: string }

/** What the parked Steward shows of a conversation whose column is closed. */
export type StewardDockFeed = {
    busy: boolean
    /** What the run is doing right now. Null leaves the pill on its generic rotation. */
    label: string | null
    pending: PendingWidget | null
    reply: StewardDockReply | null
    failed: boolean
}

export const IDLE_DOCK_FEED: StewardDockFeed = { busy: false, label: null, pending: null, reply: null, failed: false }

type PartLike = { type: string; text?: string }
type MessageLike = { id: string; role: string; parts: readonly PartLike[] }

type FeedInput = {
    messages: readonly MessageLike[]
    busy: boolean
    pending: PendingWidget | null
    failed: boolean
    copy: LiveActivityCopy
}

// The bubble shows a few lines of plain text: the marks of the markdown it does not render would
// only be noise in it.
function plain(markdown: string): string {
    return markdown
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*|__|`/g, '')
        .trim()
}

function lastReply(messages: readonly MessageLike[]): StewardDockReply | null {
    const last = messages.at(-1)
    if (!last || last.role !== 'assistant') return null
    const text = plain(last.parts.findLast(part => part.type === 'text' && part.text?.trim())?.text ?? '')
    return text ? { id: last.id, text } : null
}

export function stewardDockFeed({ messages, busy, pending, failed, copy }: FeedInput): StewardDockFeed {
    if (busy) return { ...IDLE_DOCK_FEED, busy: true, label: liveActivityLabel(messages.at(-1), copy) }
    const question = pending && isEngineHitl(pending.toolName) ? pending : null
    // A turn stopped on a question has said nothing yet: the question is the reply.
    return { busy: false, label: null, pending: question, reply: question || failed ? null : lastReply(messages), failed }
}

export type StewardNudge = { id: string; kind: 'question' | 'approval'; title: string; detail: string | null; more: number }

/** The one line of a pending question or approval the parked Steward holds up. */
export function stewardNudge(pending: PendingWidget): StewardNudge {
    const input = (pending.input ?? {}) as Record<string, unknown>
    if (pending.toolName === 'request_approval') {
        const approvals = pendingApprovals(input)
        return { id: pending.toolCallId, kind: 'approval', title: approvals[0].action, detail: approvals[0].detail ?? null, more: approvals.length - 1 }
    }
    const questions = pendingQuestions(input)
    return { id: pending.toolCallId, kind: 'question', title: questions[0].question, detail: null, more: questions.length - 1 }
}
