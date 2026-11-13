// What the Chat area shows, read from its URL: the list (`/chat`), a chat not started yet
// (`/chat/new`) or a chat (`/chat/<id>`). The screen moves between them with the History API, so the
// conversation streaming on screen is never remounted by a navigation.
export const NEW_CHAT = 'new'

export type ChatRoute = { kind: 'index' } | { kind: 'new' } | { kind: 'chat'; chatId: string }

export function chatRouteOf(pathname: string | null): ChatRoute {
    const segment = (pathname ?? '').replace(/\/+$/, '').split('/chat/')[1]
    if (!segment) return { kind: 'index' }
    const id = decodeURIComponent(segment.split('/')[0])
    return id === NEW_CHAT ? { kind: 'new' } : { kind: 'chat', chatId: id }
}

export function chatPath(route: ChatRoute): string {
    if (route.kind === 'index') return '/chat'
    if (route.kind === 'new') return `/chat/${NEW_CHAT}`
    return `/chat/${encodeURIComponent(route.chatId)}`
}
