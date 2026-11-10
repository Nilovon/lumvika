import { paidDataPriceMultiplier } from '@/lib/paid-data/pricing'

export const dynamic = 'force-dynamic'

// Paid data tools are billed on a credit this product does not sell, so the engine is told there
// are none on offer and the coworkers use their connected tools instead.
function hasBearerToken(req: Request): boolean {
    const header = req.headers.get('authorization') ?? ''
    return header.startsWith('Bearer ') && header.length > 'Bearer '.length
}

export async function GET(req: Request): Promise<Response> {
    if (!hasBearerToken(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ enabled: false, priceMultiplier: paidDataPriceMultiplier() })
}

export async function POST(req: Request): Promise<Response> {
    if (!hasBearerToken(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Paid data is not available on this install.' }, { status: 404 })
}
