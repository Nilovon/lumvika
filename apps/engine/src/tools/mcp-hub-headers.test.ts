// `env()` caches on its first call, which happens while the imports below run, so the hub the
// injection is judged against has to be in place before them.
process.env.LUMVIKA_HUB_BASE_URL = 'https://app.lumvika.com'
process.env.LUMVIKA_API_KEY = 'space-key'

const { describe, expect, it } = await import('vitest')
const { isHubMcpUrl, withHubHeaders } = await import('./mcp-hub-headers.js')
const { resolveServerSecrets } = await import('./mcp-resolve.js')
const HUB = 'https://app.lumvika.com'

type Server = Parameters<typeof withHubHeaders>[0]

function server(overrides: Partial<Server> = {}): Server {
    return { name: 'gmail', transport: 'http', args: [], env: {}, headers: {}, url: `${HUB}/api/mcp/composio/gmail`, ...overrides }
}

describe('isHubMcpUrl', () => {
    it('matches a composio server', () => {
        expect(isHubMcpUrl(`${HUB}/api/mcp/composio/gmail`, HUB)).toBe(true)
    })

    it('matches a managed server', () => {
        expect(isHubMcpUrl(`${HUB}/api/mcp/managed/typeform`, HUB)).toBe(true)
    })

    it('tolerates a trailing slash on the hub base', () => {
        expect(isHubMcpUrl(`${HUB}/api/mcp/composio/gmail`, `${HUB}/`)).toBe(true)
    })

    it('honours a hub mounted under a sub-path', () => {
        expect(isHubMcpUrl('https://h.example/base/api/mcp/composio/gmail', 'https://h.example/base')).toBe(true)
        expect(isHubMcpUrl('https://h.example/api/mcp/composio/gmail', 'https://h.example/base')).toBe(false)
    })

    it('rejects another origin', () => {
        expect(isHubMcpUrl('https://evil.example/api/mcp/composio/gmail', HUB)).toBe(false)
    })

    it('rejects a scheme downgrade on the same host', () => {
        expect(isHubMcpUrl('http://app.lumvika.com/api/mcp/composio/gmail', HUB)).toBe(false)
    })

    it('rejects another route of the same host', () => {
        expect(isHubMcpUrl(`${HUB}/api/hub`, HUB)).toBe(false)
    })

    it('rejects a path that only looks like the prefix', () => {
        expect(isHubMcpUrl(`${HUB}/api/mcpsomething`, HUB)).toBe(false)
    })

    it('rejects a traversal back out of the prefix', () => {
        expect(isHubMcpUrl(`${HUB}/api/mcp/../../evil`, HUB)).toBe(false)
    })

    it('normalises host casing and the default port', () => {
        expect(isHubMcpUrl('https://APP.Lumvika.Com/api/mcp/composio/gmail', HUB)).toBe(true)
        expect(isHubMcpUrl(`https://app.lumvika.com:443/api/mcp/composio/gmail`, HUB)).toBe(true)
    })

    it('rejects a missing url, a missing base, or an unparsable url', () => {
        expect(isHubMcpUrl(undefined, HUB)).toBe(false)
        expect(isHubMcpUrl(`${HUB}/api/mcp/composio/gmail`, undefined)).toBe(false)
        expect(isHubMcpUrl('not a url', HUB)).toBe(false)
    })
})

describe('withHubHeaders', () => {
    it('injects the caller identity', () => {
        expect(withHubHeaders(server(), 'agent-1').headers).toEqual({ 'x-lumvika-key': 'space-key', 'x-lumvika-agent': 'agent-1' })
    })

    it('overwrites an agent id forged in the config', () => {
        const forged = server({ headers: { 'x-lumvika-agent': 'someone-else' } })
        expect(withHubHeaders(forged, 'agent-1').headers['x-lumvika-agent']).toBe('agent-1')
    })

    it('overwrites a key forged in the config', () => {
        const forged = server({ headers: { 'x-lumvika-key': 'stolen' } })
        expect(withHubHeaders(forged, 'agent-1').headers['x-lumvika-key']).toBe('space-key')
    })

    it('overwrites a forged header whatever its casing, leaving no duplicate', () => {
        const forged = server({ headers: { 'X-Lumvika-Agent': 'someone-else', 'X-LUMVIKA-KEY': 'stolen' } })
        expect(withHubHeaders(forged, 'agent-1').headers).toEqual({ 'x-lumvika-key': 'space-key', 'x-lumvika-agent': 'agent-1' })
    })

    it('preserves the managed bearer and any other header', () => {
        const authed = server({ headers: { Authorization: 'Bearer third-party', 'x-trace': 'keep' } })
        expect(withHubHeaders(authed, 'agent-1').headers).toEqual({
            Authorization: 'Bearer third-party',
            'x-trace': 'keep',
            'x-lumvika-key': 'space-key',
            'x-lumvika-agent': 'agent-1',
        })
    })

    it('leaves a server pointing elsewhere untouched', () => {
        const outside = server({ url: 'https://mcp.example.com/sse', headers: { 'x-lumvika-agent': 'kept' } })
        expect(withHubHeaders(outside, 'agent-1')).toBe(outside)
    })

    it('leaves a stdio server untouched', () => {
        const stdio = server({ url: undefined, transport: 'stdio', command: 'npx' })
        expect(withHubHeaders(stdio, 'agent-1')).toBe(stdio)
    })
})

describe('resolve then inject', () => {
    it('recognises a hub url only once its placeholder is resolved', () => {
        const templated = server({ url: '${LUMVIKA_HUB_BASE_URL}/api/mcp/composio/gmail', headers: {} })
        const prepared = withHubHeaders(resolveServerSecrets(templated, {}), 'agent-1')
        expect(prepared.url).toBe(`${HUB}/api/mcp/composio/gmail`)
        expect(prepared.headers).toEqual({ 'x-lumvika-key': 'space-key', 'x-lumvika-agent': 'agent-1' })
    })

    it('does not hand the space key to a hub base the agent redirected', () => {
        const templated = server({ url: '${LUMVIKA_HUB_BASE_URL}/api/mcp/composio/gmail', headers: {} })
        const prepared = withHubHeaders(resolveServerSecrets(templated, { LUMVIKA_HUB_BASE_URL: 'https://evil.example' }), 'agent-1')
        expect(prepared.url).toBe('https://evil.example/api/mcp/composio/gmail')
        expect(prepared.headers).toEqual({})
    })
})
