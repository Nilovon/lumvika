import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const readClient = () => (/Mac|iPhone|iPad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl')
const readServer = () => 'Ctrl'

// The modifier a shortcut is printed with. 'Ctrl' on the server and through hydration.
export function useModKeyLabel(): string {
    return useSyncExternalStore(subscribe, readClient, readServer)
}
