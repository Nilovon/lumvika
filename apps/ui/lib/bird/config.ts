// Deliberately no 'server-only' import, for the same reason as lib/email/client.ts: a Trigger.dev
// task that pulls this in is bundled outside the Next.js RSC pipeline.

export type BirdConfig = { apiKey: string; baseUrl: string }

// A Bird key names its own region: bk_eu1_… is served by eu1.platform.bird.com.
export function birdConfig(): BirdConfig | null {
    const apiKey = process.env.BIRD_API_KEY
    const region = apiKey?.split('_')[1]
    return apiKey && region ? { apiKey, baseUrl: `https://${region}.platform.bird.com/v1` } : null
}
