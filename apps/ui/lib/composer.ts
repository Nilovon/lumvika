export const LONG_MESSAGE_CHARS = 300
export const LONG_MESSAGE_LINES = 3

export function isLongMessage(text: string) {
    return text.length > LONG_MESSAGE_CHARS || text.split('\n').length >= LONG_MESSAGE_LINES
}
