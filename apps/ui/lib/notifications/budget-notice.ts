export const BUDGET_EXHAUSTED_EVENT = 'workspace.budget.exhausted'
export const LUMVIKA_BUDGET_ERROR_CODE = 'lumvika_budget_exhausted'
export const BUDGET_NOTICE_WINDOW_MS = 24 * 60 * 60_000

export type BudgetNoticeDecision = { insert: boolean; email: boolean }

// One notice per workspace per window, and a sandbox never gets the email side: its in-app row is
// enough for the expert working in it.
export function decideBudgetNotice({ recentNoticeExists, isSandbox }: { recentNoticeExists: boolean; isSandbox: boolean }): BudgetNoticeDecision {
    const insert = !recentNoticeExists
    return { insert, email: insert && !isSandbox }
}

export const ENGINE_RESTARTED_ERROR_CODE = 'engine_restarted'

// The first failing run that arms the engine's budget latch (and each probe after it) still arrives
// as a per-occurrence error webhook; the dedicated workspace notice replaces its email.
// A restart reports every run it interrupted at once, so those stay in the inbox but never mail:
// the point is to unstick the conversations, not to send one email per open chat.
const EMAIL_SUPPRESSING_CODES = new Set([LUMVIKA_BUDGET_ERROR_CODE, ENGINE_RESTARTED_ERROR_CODE])

export function suppressesErrorEmail(kind: string, metadata: Record<string, unknown> | null | undefined): boolean {
    return kind === 'error' && typeof metadata?.errorCode === 'string' && EMAIL_SUPPRESSING_CODES.has(metadata.errorCode)
}
