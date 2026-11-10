'use client'

import { QuestionForm } from '@rerun/ui/chat'

import { MessageResponse } from '@/components/ai-elements/message'
import { pendingQuestions, serializeAnswers } from '@/lib/chat-hitl'

const renderMarkdown = (text: string) => <MessageResponse>{text}</MessageResponse>

// The engine foreman's ask_user. The same form as an agent's, without attachments: the foreman has
// no Box to drop them on. Answering sends the answers as the next message, which is what resumes it.
export function EngineQuestionWidget({ input, onAnswer, onDismiss }: { input: unknown; onAnswer: (text: string) => void; onDismiss?: () => void }) {
    return <QuestionForm inline questions={pendingQuestions((input ?? {}) as Record<string, unknown>)} onSubmit={answers => onAnswer(serializeAnswers(answers))} onCancel={onDismiss} renderText={renderMarkdown} />
}
