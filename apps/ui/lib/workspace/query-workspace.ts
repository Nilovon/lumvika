import { AsyncLocalStorage } from 'node:async_hooks'
import { WORKSPACE_PARAM } from './workspace-header'

const queryWorkspace = new AsyncLocalStorage<string | null>()

export function readQueryWorkspace(): string | null {
    return queryWorkspace.getStore() ?? null
}

// `headers()` cannot see the query, so a route that the browser reaches without our fetch hands
// its `?workspace=` to the session resolution through here.
export function withQueryWorkspace<Args extends [Request, ...unknown[]]>(handler: (...args: Args) => Promise<Response>) {
    return (...args: Args) => queryWorkspace.run(new URL(args[0].url).searchParams.get(WORKSPACE_PARAM), () => handler(...args))
}
