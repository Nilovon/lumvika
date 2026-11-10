// Claude Code OAuth (PKCE) — lets a user connect their Claude Pro/Max subscription
// without running `claude setup-token` in a terminal. We reuse Claude Code's own
// public OAuth client to mint a long-lived `CLAUDE_CODE_OAUTH_TOKEN`, the same token
// the CLI's `setup-token` command produces (see apps/engine providers.ts which feeds
// it to createClaudeCode()).
//
// Constants below are read from the shipped Claude Code binary (client id + endpoints
// confirmed against @anthropic-ai/claude-code). They are an undocumented/private flow:
// Anthropic can change or revoke them at any time. Always keep manual token paste as a
// fallback. Because the only registered redirect_uri is Anthropic's own callback page,
// we cannot capture the code in-browser — the user copies one short code and pastes it
// back, then the server exchanges it (the token endpoint has no browser CORS).
//
// This module runs server-side only (uses node:crypto). Import from server actions.

import { createHash, randomBytes } from 'node:crypto'

export const CLAUDE_OAUTH = {
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    // Authorize on claude.ai — the *subscription* (Pro/Max) surface that Claude Code uses
    // for "Claude account with subscription". Do NOT use platform.claude.com /
    // console.anthropic.com here: that is the Console/API (organization) surface, and it
    // drops users onto their org's authorization page (org:create_api_key) instead of
    // their personal subscription — which fails for anyone whose primary account is a
    // personal Claude subscription. Same client_id / token endpoint / scopes for both;
    // only the authorize host differs.
    authorizeUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://platform.claude.com/v1/oauth/token',
    // The only redirect_uri the client accepts — Anthropic's page that shows the code.
    redirectUri: 'https://platform.claude.com/oauth/code/callback',
    scope: 'org:create_api_key user:profile user:inference',
} as const

function base64url(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export type ClaudeOAuthStart = {
    authorizeUrl: string
    // PKCE verifier and state, round-tripped through the client (in React state, single
    // use) and handed back to the exchange step. Never stored server-side.
    verifier: string
    state: string
}

// Build the authorization URL + PKCE material. `code=true` puts Anthropic's callback in
// "show the code" mode so the user can copy it.
export function buildClaudeAuthorize(): ClaudeOAuthStart {
    const verifier = base64url(randomBytes(32))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const state = base64url(randomBytes(32))
    const params = new URLSearchParams({
        code: 'true',
        client_id: CLAUDE_OAUTH.clientId,
        response_type: 'code',
        redirect_uri: CLAUDE_OAUTH.redirectUri,
        scope: CLAUDE_OAUTH.scope,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
    })
    return { authorizeUrl: `${CLAUDE_OAUTH.authorizeUrl}?${params.toString()}`, verifier, state }
}

export type ClaudeOAuthToken = {
    // The access token to store as CLAUDE_CODE_OAUTH_TOKEN.
    accessToken: string
    // Present for the OAuth flow, absent when pasting a `claude setup-token` value. Lets the
    // engine refresh the short-lived access token instead of forcing a daily reconnect.
    refreshToken?: string
    // Epoch ms when the access token expires, if the endpoint returned `expires_in`.
    expiresAt?: number
}

// Exchange the pasted code for an OAuth token. Anthropic shows the code as `code#state`;
// we split it and verify the state matches what we issued. Returns the access token plus
// the refresh token and expiry needed for the engine to keep it fresh.
export async function exchangeClaudeCode(rawCode: string, verifier: string, expectedState: string): Promise<ClaudeOAuthToken> {
    const [code, returnedState] = rawCode.trim().split('#')
    if (!code) throw new Error('Empty code')
    if (returnedState && expectedState && returnedState !== expectedState) throw new Error('Oops, this code comes from another Claude tab. Close your Claude tabs, click Open Claude again and paste the new code.')

    // Claude Code's token endpoint expects a JSON body (a form-urlencoded body returns
    // 400 "Invalid request format"), and it requires the `state` echoed back alongside
    // the code — Anthropic ties the PKCE verifier to that state, so omitting it 400s too.
    const res = await fetch(CLAUDE_OAUTH.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            state: returnedState ?? expectedState,
            redirect_uri: CLAUDE_OAUTH.redirectUri,
            client_id: CLAUDE_OAUTH.clientId,
            code_verifier: verifier,
        }),
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Token exchange failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`)
    }
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!json.access_token) throw new Error('No access_token in response')
    return {
        accessToken: json.access_token,
        refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
        expiresAt: typeof json.expires_in === 'number' ? Date.now() + json.expires_in * 1000 : undefined,
    }
}
