import { getAuth } from '@/lib/auth/auth'
import { toNextJsHandler } from 'better-auth/next-js'

// Built on the first request, not on import: `next build` imports every route to collect its
// configuration, and the published image is built without a database.
const handler = () => toNextJsHandler(getAuth())

export const GET = (request: Request) => handler().GET(request)
export const POST = (request: Request) => handler().POST(request)
