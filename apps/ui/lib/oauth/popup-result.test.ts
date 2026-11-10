import { describe, expect, it } from 'vitest'
import { escapeHtml, oauthPopupResponse, scriptSafeJson } from './popup-result'

describe('escapeHtml', () => {
    it('neutralises every character that opens markup', () => {
        expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;')
    })
})

describe('scriptSafeJson', () => {
    it('cannot close the script block it is printed into', () => {
        const json = scriptSafeJson({ error: '</script><script>alert(1)</script>\u2028' })
        expect(json).not.toContain('<')
        expect(json).not.toContain('>')
        expect(json).not.toContain('\u2028')
        expect(JSON.parse(json)).toEqual({ error: '</script><script>alert(1)</script>\u2028' })
    })
})

describe('oauthPopupResponse', () => {
    const injected = `</script><img src=x onerror=alert(1)>`

    it('escapes the label and the message for their contexts', async () => {
        const res = oauthPopupResponse({ channel: 'mcp-oauth', message: { type: 'mcp-oauth-error', error: injected }, label: `Authorization failed: ${injected}` })
        const body = await res.text()
        expect(body).not.toContain('<img')
        expect(body).toContain('Authorization failed: &lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;')
        expect(body).toContain('\\u003c/script\\u003e\\u003cimg')
        expect(body.match(/<\/script>/g)).toHaveLength(1)
    })

    it('only runs the script it was born with', async () => {
        const res = oauthPopupResponse({ channel: 'managed-oauth', message: { type: 'managed-oauth-success' }, label: 'Connected.' })
        const body = await res.text()
        const nonce = res.headers.get('content-security-policy')?.match(/script-src 'nonce-([^']+)'/)?.[1]
        expect(nonce).toBeTruthy()
        expect(body).toContain(`<script nonce="${nonce}">`)
        expect(body).toContain(`<style nonce="${nonce}">`)
        expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
        expect(res.headers.get('x-content-type-options')).toBe('nosniff')
        expect(res.headers.get('referrer-policy')).toBe('no-referrer')
        expect(res.headers.get('cache-control')).toBe('no-store')
        expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    })

    it('draws a fresh nonce for every page', () => {
        const nonceOf = (res: Response) => res.headers.get('content-security-policy')?.match(/nonce-([^']+)/)?.[1]
        const page = () => oauthPopupResponse({ channel: 'c', message: {}, label: 'x' })
        expect(nonceOf(page())).not.toBe(nonceOf(page()))
    })

    it('posts the message on the channel it was given', async () => {
        const body = await oauthPopupResponse({ channel: 'composio-oauth', message: { type: 'composio-oauth-success', accountLabel: 'me@acme.test' }, label: 'Connected as me@acme.test.' }).text()
        expect(body).toContain(`new BroadcastChannel("composio-oauth")`)
        expect(body).toContain(`var msg = {"type":"composio-oauth-success","accountLabel":"me@acme.test"}`)
        expect(body).toContain('<p>Connected as me@acme.test.</p>')
    })
})
