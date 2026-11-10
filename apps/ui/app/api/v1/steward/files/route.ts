import { stewardEngineFilesAction } from '@/app/api/_actions/steward-file.actions'
import { apiRoute } from '@/app/api/v1/_lib/api-route'
import type { StewardEngineFiles } from '@lumvika/contracts'

export const dynamic = 'force-dynamic'

export const GET = apiRoute({ auth: 'member' }, async (): Promise<StewardEngineFiles> => ({ supported: await stewardEngineFilesAction() }))
