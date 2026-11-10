import { describe, expect, it } from 'vitest'
import { GET, POST } from './route'

const request = (method: 'GET' | 'POST', token?: string) =>
    new Request('https://app.example.com/api/paid-data', { method, headers: token ? { authorization: `Bearer ${token}` } : {} })

describe('/api/paid-data', () => {
    it('refuses a call without a token', async () => {
        expect((await GET(request('GET'))).status).toBe(401)
        expect((await POST(request('POST'))).status).toBe(401)
    })

    it('tells the engine nothing is on offer', async () => {
        const body = await (await GET(request('GET', 'engine-key'))).json()
        expect(body.enabled).toBe(false)
    })

    it('answers a purchase with not found', async () => {
        expect((await POST(request('POST', 'engine-key'))).status).toBe(404)
    })
})
