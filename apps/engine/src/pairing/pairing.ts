import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { env, setEnv } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { buildCommit } from '../runtime/build-info.js'

// A server started from the Servers page of a self-hosted app carries a one-time token
// (LUMVIKA_PAIR_TOKEN) and the address of that app (LUMVIKA_HUB_URL). It makes up its own key, keeps it
// in its data-dir, and hands it to the app, which reaches back with it before attaching the server
// to a workspace. The key never travels in the command, nor in a URL.

const KEY_FILE = 'engine.key'
const HUB_FILE = 'hub.json'
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000]

type PairedHub = { hubUrl: string; workspaceId: number }

const pathOf = (file: string) => join(env().LUMVIKA_DATA_DIR, file)

function readPairedHub(): PairedHub | null {
    try {
        return JSON.parse(readFileSync(pathOf(HUB_FILE), 'utf8')) as PairedHub
    } catch {
        return null
    }
}

// Before the server listens: a key of its own when it is about to pair and was given none, and the
// hub it paired with on an earlier start.
export function loadPairingIdentity(): void {
    const { LUMVIKA_API_KEY, LUMVIKA_HUB_BASE_URL, LUMVIKA_DATA_DIR } = env()
    const pairing = Boolean(process.env.LUMVIKA_PAIR_TOKEN)
    if (!LUMVIKA_API_KEY && (pairing || existsSync(pathOf(KEY_FILE)))) {
        mkdirSync(LUMVIKA_DATA_DIR, { recursive: true })
        if (!existsSync(pathOf(KEY_FILE))) writeFileSync(pathOf(KEY_FILE), randomBytes(32).toString('hex'), { mode: 0o600 })
        setEnv({ LUMVIKA_API_KEY: readFileSync(pathOf(KEY_FILE), 'utf8').trim() })
    }
    const paired = readPairedHub()
    if (!LUMVIKA_HUB_BASE_URL && paired) setEnv({ LUMVIKA_HUB_BASE_URL: paired.hubUrl })
}

class PairingRefused extends Error {}

async function postPairing(hubUrl: string, token: string): Promise<PairedHub> {
    const response = await fetch(`${hubUrl.replace(/\/$/, '')}/api/engines/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, apiKey: env().LUMVIKA_API_KEY, url: process.env.LUMVIKA_PUBLIC_URL || null, version: buildCommit() }),
        signal: AbortSignal.timeout(30_000),
    })
    const body = (await response.json().catch(() => ({}))) as { error?: string; workspaceId?: number }
    if (response.status >= 400 && response.status < 500) throw new PairingRefused(body.error ?? `the app refused the pairing (${response.status})`)
    if (!response.ok || typeof body.workspaceId !== 'number') throw new Error(body.error ?? `the app answered ${response.status}`)
    // The address it just reached the app at is the one that works from here, whatever the app calls itself.
    return { hubUrl: hubUrl.replace(/\/$/, ''), workspaceId: body.workspaceId }
}

// Once the server listens, since the app checks it can reach it before attaching it. A refusal is
// final and said plainly; an app that does not answer yet is asked again a few times.
export async function pairWithHub(): Promise<void> {
    const token = process.env.LUMVIKA_PAIR_TOKEN
    const hubUrl = process.env.LUMVIKA_HUB_URL
    if (!token || !hubUrl) return
    if (readPairedHub()) return

    for (let attempt = 0; ; attempt++) {
        try {
            const paired = await postPairing(hubUrl, token)
            writeFileSync(pathOf(HUB_FILE), JSON.stringify(paired))
            setEnv({ LUMVIKA_HUB_BASE_URL: paired.hubUrl })
            logger.info({ hub: paired.hubUrl, workspaceId: paired.workspaceId }, 'paired with the app: this server now runs the coworkers of its workspace')
            return
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            const delay = RETRY_DELAYS_MS[attempt]
            if (err instanceof PairingRefused || delay === undefined) {
                logger.error({ hub: hubUrl }, `pairing failed: ${message}`)
                return
            }
            logger.warn({ hub: hubUrl, retryInMs: delay }, `pairing not done yet: ${message}`)
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }
}
