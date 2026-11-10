import { detectInAppBrowser, type InAppBrowser } from '@/lib/in-app-browser'
import { useSyncExternalStore } from 'react'

const subscribeNever = () => () => {}

export function useInAppBrowser(): InAppBrowser | null {
    return useSyncExternalStore(
        subscribeNever,
        () => detectInAppBrowser(navigator.userAgent),
        () => null
    )
}
