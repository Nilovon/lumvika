'use client'

import { lazy, Suspense } from 'react'

import type { ComposerMention } from '@/lib/chat/composer-links'

const MessageMarkdown = lazy(() => import('@/components/chat/AgentWorkspaceMessage').then(module => ({ default: module.AgentWorkspaceMessage })))

// The markdown of the chat, mentions drawn as the composer drew them. Loaded with the first message,
// the plain text standing in until then so nothing jumps.
export function ChannelMarkdown({ body, mentions }: { body: string; mentions: ComposerMention[] }) {
    return (
        <Suspense fallback={<p className="text-sm whitespace-pre-wrap">{body}</p>}>
            <MessageMarkdown composerTokens mentions={mentions} className="text-sm leading-relaxed break-words">
                {body}
            </MessageMarkdown>
        </Suspense>
    )
}
