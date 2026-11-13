import { CLAUDE_SESSION_MAX_IDLE_MS, claudeConfigDir, sweepClaudeTranscripts } from '../agents/claude-sessions.js'
import { agentsDir } from '../config/paths.js'
import { logger } from '../lib/logger.js'
import { activeRunCount } from '../runtime/run-control.js'

let lastSweepAt = 0

// A chat resumes its Claude CLI session from one message to the next, and the CLI keeps each one as
// a transcript in its home, outside the data-dir. A conversation drops the transcript of the session
// it leaves; the sessions gone idle and what an engine restart orphaned go here, as often as a
// session can go idle. A busy box leaves `lastSweepAt` alone, so the sweep comes back on the next tick.
export async function sweepClaudeTranscriptsIfDue(): Promise<void> {
    const now = Date.now()
    if (now - lastSweepAt < CLAUDE_SESSION_MAX_IDLE_MS) return
    if (activeRunCount() > 0) return
    lastSweepAt = now
    const removed = await sweepClaudeTranscripts(claudeConfigDir({}), agentsDir())
    if (removed) logger.info({ removed }, 'claude transcripts swept')
}
