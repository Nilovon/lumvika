// A self-hosted install runs no pool of hosts, so no sample ever arrives.
export async function receiveHostSample(_request: Request): Promise<Response> {
    return new Response(null, { status: 404 })
}
