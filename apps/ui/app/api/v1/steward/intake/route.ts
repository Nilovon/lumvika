import { saveStewardIntakeAction } from '@/app/api/_actions/steward-intake.actions'
import { apiRoute } from '@/app/api/v1/_lib/api-route'
import { stewardIntakeSchema } from '@lumvika/contracts'

export const dynamic = 'force-dynamic'

// The welcome card's answers: writes the profile and closes discovery, as the web card does.
export const POST = apiRoute({ auth: 'member', body: stewardIntakeSchema }, ({ body }) => saveStewardIntakeAction(body))
