import { withKeyedLock } from '../lib/lock.js'

export function withConnectionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return withKeyedLock(`connection:${id}`, fn)
}
