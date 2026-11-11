import { apiRoute } from '@/app/api/v1/_lib/api-route'
import type { ClientConfig } from '@lumvika/contracts'

export const dynamic = 'force-dynamic'

function minIosBuild(): number {
    const build = Number.parseInt(process.env.MOBILE_IOS_MIN_BUILD ?? '', 10)
    return Number.isInteger(build) && build > 0 ? build : 0
}

// No `server`: the hub signs people in itself, there is no separate auth project for a phone to reach.
export const GET = apiRoute({ auth: 'public' }, async (): Promise<ClientConfig> => ({ minBuild: minIosBuild() }))
