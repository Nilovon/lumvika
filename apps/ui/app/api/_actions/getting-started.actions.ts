'use server'

import { requireWorkspaceContext } from '@/app/api/_auth/ownership'
import { markGettingStarted, restoreGettingStarted } from '@/app/api/_services/getting-started.service'

export async function dismissGettingStartedAction(): Promise<void> {
    const ctx = await requireWorkspaceContext()
    await markGettingStarted(ctx.scope, ctx.workspace.id, ['dismissed'])
}

export async function restoreGettingStartedAction(): Promise<void> {
    const ctx = await requireWorkspaceContext()
    await restoreGettingStarted(ctx.scope, ctx.workspace.id)
}
