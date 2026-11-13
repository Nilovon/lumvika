'use server'

import { clearToolkitAuthConfig, connectComposio, createToolkitAuthConfig, disconnectComposio, readComposioOverview, setToolkitAuthConfig, type ComposioOverview } from '@/app/api/_services/composio-settings.service'
import { getAuthUser } from '@/lib/auth/session/getServerSession'
import { isAdminEmail } from '@/lib/auth/admin-emails'
import { AppError, failure, failureOf, type ActionFailure } from '@/lib/i18n/action-error'
import { LUMVIKA_CLOUD } from '@lumvika/cloud/edition'

type Result<T> = ({ ok: true } & T) | ActionFailure

// The Composio connection belongs to the install, not to a workspace: its key acts for every
// coworker on it. Only the people of ADMIN_EMAILS manage it, and only on a self-hosted install,
// where Lumvika Cloud's own key and auth configs are not in play.
async function composioAdmin(): Promise<{ userId: string } | ActionFailure> {
    if (LUMVIKA_CLOUD) return failure('composioManagedByCloud')
    const user = await getAuthUser()
    if (!user) return failure('notAuthenticated')
    if (!isAdminEmail(user.email)) return failure('adminOnlyComposio')
    return { userId: user.id }
}

function failed(error: unknown): ActionFailure {
    if (!(error instanceof AppError)) console.error('[composio]', error)
    return failureOf(error, 'somethingWentWrong')
}

export async function getComposioOverviewAction(): Promise<Result<{ overview: ComposioOverview }>> {
    const admin = await composioAdmin()
    if ('ok' in admin) return admin
    try {
        return { ok: true, overview: await readComposioOverview() }
    } catch (error) {
        return failed(error)
    }
}

export async function connectComposioAction(input: { apiKey: string }): Promise<Result<object>> {
    const admin = await composioAdmin()
    if ('ok' in admin) return admin
    if (typeof input?.apiKey !== 'string') return failure('composioKeyEmpty')
    try {
        await connectComposio(input.apiKey, admin.userId)
        return { ok: true }
    } catch (error) {
        return failed(error)
    }
}

export async function disconnectComposioAction(): Promise<Result<object>> {
    const admin = await composioAdmin()
    if ('ok' in admin) return admin
    try {
        await disconnectComposio()
        return { ok: true }
    } catch (error) {
        return failed(error)
    }
}

export async function setComposioAuthConfigAction(input: { toolkit: string; authConfigId: string }): Promise<Result<object>> {
    const admin = await composioAdmin()
    if ('ok' in admin) return admin
    if (typeof input?.toolkit !== 'string' || typeof input.authConfigId !== 'string') return failure('composioInvalidAuthConfig')
    try {
        await setToolkitAuthConfig(input.toolkit, input.authConfigId, admin.userId)
        return { ok: true }
    } catch (error) {
        return failed(error)
    }
}

export async function clearComposioAuthConfigAction(input: { toolkit: string }): Promise<Result<object>> {
    const admin = await composioAdmin()
    if ('ok' in admin) return admin
    if (typeof input?.toolkit !== 'string') return failure('composioUnknownToolkit')
    try {
        await clearToolkitAuthConfig(input.toolkit)
        return { ok: true }
    } catch (error) {
        return failed(error)
    }
}

export async function createComposioAuthConfigAction(input: { toolkit: string }): Promise<Result<{ authConfigId: string }>> {
    const admin = await composioAdmin()
    if ('ok' in admin) return admin
    if (typeof input?.toolkit !== 'string') return failure('composioUnknownToolkit')
    try {
        return { ok: true, authConfigId: await createToolkitAuthConfig(input.toolkit, admin.userId) }
    } catch (error) {
        return failed(error)
    }
}
