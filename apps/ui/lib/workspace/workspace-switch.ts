import { useSyncExternalStore } from 'react'
import { clearTabWorkspace } from './tab-workspace'

// Switching workspace reloads the whole app rather than swapping the context in place: module
// caches, stores and realtime channels all hold the previous workspace, and a hard navigation is
// the only way none of it survives. To `/` and not a reload, because the current URL (an agent, an
// open panel) belongs to the workspace being left.
let switching = false
let loaderVisible = false
const listeners = new Set<() => void>()

function setState(nextSwitching: boolean, nextLoaderVisible: boolean) {
    switching = nextSwitching
    if (loaderVisible === nextLoaderVisible) return
    loaderVisible = nextLoaderVisible
    listeners.forEach(listener => listener())
}

// `loader: false` for a caller that keeps its own UI on screen until it knows the switch goes
// through, the loader then shows up at `enterActiveWorkspace`.
export function beginWorkspaceSwitch({ loader = true }: { loader?: boolean } = {}) {
    setState(true, loader)
}

export function abortWorkspaceSwitch() {
    setState(false, false)
}

// Every switch has just written `users.workspace_id` server-side: dropping the tab's pin is what
// makes it open on that one.
export function enterActiveWorkspace() {
    setState(true, true)
    clearTabWorkspace()
    window.location.assign('/')
}

// Lets the session tell a switch this tab is carrying out, which navigates on its own once done,
// from losing the workspace it is on, which it has to follow.
export function isWorkspaceSwitchInFlight() {
    return switching
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function useWorkspaceSwitchLoader() {
    return useSyncExternalStore(
        subscribe,
        () => loaderVisible,
        () => false
    )
}
