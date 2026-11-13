import { claudeConfigDir, sweepClaudeTranscripts } from '../agents/claude-sessions.js'
import { agentsDir } from '../config/paths.js'
import { logger } from '../lib/logger.js'
import { activeRunCount } from '../runtime/run-control.js'

const SWEEP_INTERVAL_MS = 86_400_000

let lastSweepAt = 0

// A chat resumes its Claude CLI session from one message to the next, and the CLI keeps each one as
// a transcript in its home, outside the data-dir. A conversation drops the transcript of the session
// it leaves; what an engine restart orphaned goes here. A busy box leaves `lastSweepAt` alone, so the
// sweep comes back on the next tick.
export async function sweepClaudeTranscriptsIfDue(): Promise<void> {
    const now = Date.now()
    if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
    if (activeRunCount() > 0) return
    lastSweepAt = now
    const removed = await sweepClaudeTranscripts(claudeConfigDir({}), agentsDir()).catch(err => {
        logger.warn({ err: String(err) }, 'claude transcript sweep failed')
        return 0
    })
    if (removed) logger.info({ removed }, 'claude transcripts swept')
}
