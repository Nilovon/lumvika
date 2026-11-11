import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/session/getServerSession', () => ({
    getAuthUser: async () => {
        throw new Error('a public route never looks for a caller')
    },
}))

const { GET } = await import('./route')

const segment = { params: Promise.resolve({}) }

async function clientConfig(url = 'https://app.lumvika.com/api/v1/client', headers: Record<string, string> = {}) {
    const res = await GET(new Request(url, { headers }), segment)
    expect(res.status).toBe(200)
    return res.json()
}

async function minBuild(): Promise<number> {
    return (await clientConfig()).minBuild
}

describe('GET /api/v1/client', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('answers without a signed-in caller, so the version gate runs before sign-in', async () => {
        vi.stubEnv('MOBILE_IOS_MIN_BUILD', '12')
        expect(await minBuild()).toBe(12)
    })

    it('lets every build through when the variable is unset or unreadable', async () => {
        vi.stubEnv('MOBILE_IOS_MIN_BUILD', '')
        expect(await minBuild()).toBe(0)
        vi.stubEnv('MOBILE_IOS_MIN_BUILD', 'twelve')
        expect(await minBuild()).toBe(0)
    })

    it('names no separate auth server: the hub signs people in itself', async () => {
        expect((await clientConfig()).server).toBeUndefined()
    })
})
