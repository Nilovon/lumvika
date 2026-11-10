import { clientMetadataDocument } from '@/lib/mcp-oauth'

// Publicly dereferenceable Client ID Metadata Document. The authorization server fetches this
// URL (which doubles as our client_id) server-to-server, so it must not be auth-gated.
export function GET(req: Request) {
    return Response.json(clientMetadataDocument(req), {
        headers: { 'Cache-Control': 'public, max-age=3600' },
    })
}
