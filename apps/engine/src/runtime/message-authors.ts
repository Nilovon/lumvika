import type { MessageAuthor } from '@rerun/contracts'
import type { ModelMessage } from 'ai'

type AuthoredRow = { role: string; authorId: string | null; authorName: string | null }

// One person talking needs no signature, and leaving their messages untouched keeps the cached
// prompt prefix of every solo conversation exactly as it was.
export function isSharedConversation(authorIds: Iterable<string>): boolean {
    return new Set(authorIds).size > 1
}

export function senderTag(name: string): string {
    return `<sender>${name.replace(/[<>]/g, '')}</sender>`
}

export function signText(text: string, author: Pick<MessageAuthor, 'name'> | null | undefined): string {
    return author?.name ? `${senderTag(author.name)}\n${text}` : text
}

// The signature goes on the words the person typed, the first text part: the context the engine
// appended after them is not theirs.
export function signHistoryMessage(message: ModelMessage, row: AuthoredRow): ModelMessage {
    if (row.role !== 'user' || message.role !== 'user' || !row.authorName) return message
    const author = { name: row.authorName }
    if (typeof message.content === 'string') return { ...message, content: signText(message.content, author) }
    const first = message.content.findIndex(part => part.type === 'text')
    if (first < 0) return message
    return { ...message, content: message.content.map((part, i) => (i === first && part.type === 'text' ? { ...part, text: signText(part.text, author) } : part)) }
}
