import { getAppOrigin } from '@/lib/app-origin'

export const MAX_TRIGGER_BODY_BYTES = 1_048_576

// Content-Length is only the sender's word, so the stream is counted too and dropped as soon as it
// goes past the cap. Null means too large; an unreadable body reads as empty, like req.text() did.
export async function readBodyCapped(req: Request, maxBytes: number): Promise<string | null> {
    if (Number(req.headers.get('content-length') ?? 0) > maxBytes) return null
    if (!req.body) return ''

    const reader = req.body.getReader()
    const decoder = new TextDecoder()
    let total = 0
    let text = ''
    try {
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            total += chunk.value.byteLength
            if (total > maxBytes) break
            text += decoder.decode(chunk.value, { stream: true })
        }
    } catch {
        return ''
    }
    if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return null
    }
    return text + decoder.decode()
}

// The public URL of a trigger, built server-side. TriggerUrlField builds the same path in the
// browser from window.location.origin instead: the origin the user is looking at is the one they
// should paste into the other service.
export async function triggerWebhookUrl(agentId: string, slug: string, token: string): Promise<string> {
    return `${await getAppOrigin()}/api/t/${agentId}/${slug}/${token}`
}
