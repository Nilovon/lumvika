import { facebookProvider } from './providers/facebook'
import { typeformProvider } from './providers/typeform'
import type { ManagedProvider } from './types'

const PROVIDERS: Record<string, ManagedProvider> = {
    [facebookProvider.id]: facebookProvider,
    [typeformProvider.id]: typeformProvider,
}

export function getManagedProvider(id: string): ManagedProvider | undefined {
    return PROVIDERS[id]
}
