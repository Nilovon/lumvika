import { isTextUIPart, type UIMessage } from 'ai'

// The engine owns the conversation state (addressed by `engineSessionId`), so /api/chat
// only ever needs the text of the message being sent. Posting the whole transcript is
// what pushed a research session's request past the proxy's 10MB body cap.
export function lastUserText(messages: UIMessage[]): string {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'user') return ''

    return last.parts
        .filter(isTextUIPart)
        .map(part => part.text)
        .join('')
}
