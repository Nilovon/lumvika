import { apiRoute } from '@/app/api/v1/_lib/api-route'
import type { ForemanTrialResult } from '@rerun/contracts'

export const dynamic = 'force-dynamic'

// The "Build my team" button of the app. There are no plans here, so every workspace is already on.
export const POST = apiRoute({ auth: 'admin' }, async (): Promise<ForemanTrialResult> => ({ entitled: true }))
