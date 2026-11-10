// Node's fetch (undici) rejects with a bare `TypeError: fetch failed` when the host does not answer,
// and AbortSignal.timeout() aborts with a `TimeoutError`. Neither means anything to a person.
// An `AbortError` is a caller stopping on purpose (a Stop button): it is not a network failure.
export function isNetworkFailure(err: unknown): boolean {
    if (!(err instanceof Error)) return false
    if (err.name === 'TimeoutError') return true
    return err instanceof TypeError && err.message === 'fetch failed'
}

const SIGN_IN_SERVICE_UNREACHABLE = "Couldn't reach the sign-in service. Try again in a moment."

// What a sign-in route answers when it fails: a third party that did not answer (Composio, an MCP
// server's OAuth endpoints) gets a sentence, any other error keeps its own message.
export function describeSignInError(err: unknown, fallback: string): string {
    if (isNetworkFailure(err)) return SIGN_IN_SERVICE_UNREACHABLE
    return err instanceof Error ? err.message : fallback
}
