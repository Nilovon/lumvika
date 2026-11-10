import { getProviderIncidents } from '@/lib/provider-status/provider-status'

export const dynamic = 'force-dynamic'

export async function GET() {
    return Response.json({ incidents: await getProviderIncidents() }, { headers: { 'Cache-Control': 'no-store' } })
}
