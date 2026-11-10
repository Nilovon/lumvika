import { withKeyedLock } from '../lib/lock.js'

export function withAgentLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return withKeyedLock(`agent:${id}`, fn)
}
