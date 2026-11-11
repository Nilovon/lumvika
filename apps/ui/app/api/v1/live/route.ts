// The mobile app's path to the same stream: /api/v1 stays out of the proxy, which a bearer token has no use for.
export { GET } from '@/app/api/live/route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
