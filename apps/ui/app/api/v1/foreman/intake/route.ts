import { saveForemanIntakeAction } from '@/app/api/_actions/foreman-intake.actions'
import { apiRoute } from '@/app/api/v1/_lib/api-route'
import { foremanIntakeSchema } from '@rerun/contracts'

export const dynamic = 'force-dynamic'

// The welcome card's answers: writes the profile and closes discovery, as the web card does.
export const POST = apiRoute({ auth: 'member', body: foremanIntakeSchema }, ({ body }) => saveForemanIntakeAction(body))
