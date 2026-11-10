import { asStringArray } from '@/lib/mcp/args'

// What ask_choice, ask_input and ask_either are answered with. Apart from the widgets so the seal the
// server puts on a question left open speaks the same shape without importing a client component.

// Why a question closed without an answer: "Neither" clicked on an either card, an answer typed in the
// composer instead, the card closed, or the conversation left with the card still open. A transcript
// written before the reason existed carries none.
export const UNANSWERED_REASONS = ['neither', 'typed', 'dismissed', 'abandoned'] as const
export type UnansweredReason = (typeof UNANSWERED_REASONS)[number]

export type QuestionAnswer = { answered: true; question: string; answers: string[] } | { answered: false; reason?: UnansweredReason }

export function readQuestionOutput(output: unknown): QuestionAnswer | null {
    if (!output || typeof output !== 'object') return null
    const value = output as Record<string, unknown>
    if (value.answered !== true) {
        const reason = UNANSWERED_REASONS.find(known => known === value.reason)
        return reason ? { answered: false, reason } : { answered: false }
    }
    return { answered: true, question: typeof value.question === 'string' ? value.question : '', answers: asStringArray(value.answers) }
}
