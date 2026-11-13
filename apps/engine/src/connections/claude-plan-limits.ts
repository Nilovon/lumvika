import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { CONNECTION_TOKEN_KEY } from '@lumvika/contracts'
import { planUsageReaderOf } from '../agents/claude-context.js'
import { CLAUDE_HARNESS_ENV, claudeAuthEnv } from '../agents/providers.js'
import { childProcessEnv } from '../lib/child-env.js'
import { logger } from '../lib/logger.js'
import { acquireClaudeLease, ensureFreshClaudeToken } from './claude-token.js'
import { isCredentialRejected } from './credential-rejections.js'
import { PROBE_FAILED, planLimitsFromClaude, readPlanLimits, recordPlanLimitsReading, type ClaudePlanUsage } from './plan-limits.js'
import type { LoadedConnection } from './types.js'

// A cold start may unpack the CLI first; the usage call itself is one request to claude.ai.
const INIT_TIMEOUT_MS = 20_000
const USAGE_TIMEOUT_MS = 8_000
const STALE_AFTER_MS = 5 * 60_000
const RETRY_AFTER_FAILURE_MS = 2 * 60_000

const inFlight = new Map<string, Promise<void>>()
const attemptedAt = new Map<string, number>()

async function withinTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    try {
        return await Promise.race([
            task,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('claude usage probe timed out')), ms)
            }),
        ])
    } finally {
        clearTimeout(timer)
    }
}

// The prompt never yields, so the CLI starts, answers its control requests and never sends a
// message to the model: the read costs the subscription nothing. The working directory is a
// throwaway one, nothing of it is kept on the box.
export async function probeClaudeUsage(connection: LoadedConnection): Promise<ClaudePlanUsage | null> {
    const abort = new AbortController()
    const cwd = await mkdtemp(join(tmpdir(), 'lumvika-claude-usage-'))
    const idle = new Promise<void>(resolve => abort.signal.addEventListener('abort', () => resolve(), { once: true }))
    const prompt = (async function* (): AsyncGenerator<SDKUserMessage> {
        await idle
    })()
    try {
        const live = query({
            prompt,
            options: {
                abortController: abort,
                cwd,
                env: { ...childProcessEnv({}), ...CLAUDE_HARNESS_ENV, ...claudeAuthEnv(connection.env), ANTHROPIC_API_KEY: undefined },
                persistSession: false,
                settingSources: [],
                tools: [],
                strictMcpConfig: true,
            },
        })
        await withinTimeout(live.initializationResult(), INIT_TIMEOUT_MS)
        const readPlanUsage = planUsageReaderOf(live)
        if (!readPlanUsage) return null
        return await withinTimeout(readPlanUsage({ skipBehaviors: true }), USAGE_TIMEOUT_MS)
    } catch (err) {
        logger.warn({ connection: connection.id, err: (err as Error).message }, 'claude usage probe failed')
        return null
    } finally {
        abort.abort()
        await rm(cwd, { recursive: true, force: true }).catch(() => {})
    }
}

// Never flags the credential as refused: a probe that fails says nothing a run would not say better.
export function refreshClaudePlanLimits(connection: LoadedConnection | null, probe: typeof probeClaudeUsage = probeClaudeUsage): Promise<void> {
    if (!connection || connection.config.provider !== 'claude' || !connection.env[CONNECTION_TOKEN_KEY.claude] || isCredentialRejected(connection.id)) return Promise.resolve()

    const pending = inFlight.get(connection.id)
    if (pending) return pending

    attemptedAt.set(connection.id, Date.now())
    const task = (async () => {
        await ensureFreshClaudeToken(connection)
        const release = acquireClaudeLease(connection)
        let usage: ClaudePlanUsage | null
        try {
            usage = await probe(connection)
        } finally {
            release()
        }
        recordPlanLimitsReading(connection.id, planLimitsFromClaude(usage) ?? PROBE_FAILED)
    })()
        .catch(err => logger.warn({ connection: connection.id, err: (err as Error).message }, 'claude plan limits read failed'))
        .finally(() => inFlight.delete(connection.id))

    inFlight.set(connection.id, task)
    return task
}

export function pendingClaudePlanLimits(connectionId: string): Promise<void> | undefined {
    return inFlight.get(connectionId)
}

// Aged from the newer of the last attempt and the last reading, since a run's end reads the same
// windows on its way out: a list right after a run must not spawn a CLI for what it just learned.
// A failed read is tried again sooner, never on every list.
export function claudePlanLimitsStale(connectionId: string, now = Date.now()): boolean {
    const reading = readPlanLimits(connectionId)
    const failed = !!reading?.refreshFailedAt || reading?.unavailable?.reason === 'probeFailed'
    const last = Math.max(attemptedAt.get(connectionId) ?? 0, Date.parse(reading?.capturedAt ?? '') || 0)
    return now - last >= (failed ? RETRY_AFTER_FAILURE_MS : STALE_AFTER_MS)
}

// For the paths that answer with the reading they have: the fresh one is there for the next ask.
export function refreshStaleClaudePlanLimits(connections: LoadedConnection[]): void {
    for (const connection of connections) {
        if (connection.config.provider !== 'claude' || !claudePlanLimitsStale(connection.id)) continue
        void refreshClaudePlanLimits(connection)
    }
}

export function forgetClaudePlanLimitsAttempt(connectionId: string): void {
    attemptedAt.delete(connectionId)
}
