import type { MessageAuthor, Provider, ReasoningEffort } from '@lumvika/contracts'
import type { UIMessageStreamWriter } from 'ai'
import type { TurnOrder } from '../agents/turn-order.js'
import type { LoadedAgent } from '../agents/types.js'
import type { AgentRow } from '../db/schema.js'
import type { Logger } from '../lib/logger.js'
import type { HostBreaker } from '../tools/host-breaker.js'
import type { ScreenshotStore } from './screenshots.js'

// `channel`: the chat is a coworker answering in a hub channel or direct message. What it hears there
// belongs to the people of that channel, so nothing of it is curated into the coworker's memory.
export type RunTrigger = { source: 'chat'; author?: MessageAuthor; effort?: ReasoningEffort; userLanguage?: string; callableAgentIds?: string[]; calledBy?: string; channel?: boolean } | { source: 'schedule'; slug: string; name: string } | { source: 'trigger'; slug: string; name: string } | { source: 'issue'; slug: string; name: string }

export type PartialResult = { label: string; text: string }

export type SkillProposalNotice = { proposalId: string; mode: string; title: string }

export type RunContext = {
    agent: LoadedAgent
    sessionId: string
    runId?: string
    logger: Logger
    provider: Provider
    model: string
    turnOrder: TurnOrder
    author?: MessageAuthor
    writer?: UIMessageStreamWriter
    abortSignal?: AbortSignal
    callTargets?: AgentRow[]
    // Who the person behind the run reaches, handed down to every coworker it calls.
    callableAgentIds?: string[]
    // The run answers in a hub channel or direct message (see RunTrigger): what it hears there stays there.
    channel?: boolean
    hostBreaker?: HostBreaker
    partialResults?: PartialResult[]
    skillProposals?: SkillProposalNotice[]
    screenshots?: ScreenshotStore
}
