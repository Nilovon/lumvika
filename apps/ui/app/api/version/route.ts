export function GET() {
    return Response.json({ buildSha: process.env.NEXT_PUBLIC_BUILD_SHA }, { headers: { 'Cache-Control': 'no-store' } })
}
