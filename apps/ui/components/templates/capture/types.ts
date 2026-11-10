import type { AgentCapturePlan, CaptureSelection, CaptureSourceSpace } from '@/lib/templates/capture'

export type CaptureSourcesResult = { ok: true; spaces: CaptureSourceSpace[] } | { ok: false; error: string }
export type CapturePlanResult = { ok: true; plans: AgentCapturePlan[] } | { ok: false; error: string }
export type CaptureRunResult = { ok: true; captured: number; warnings: string[] } | { ok: false; error: string }

// One action per prop, each answering a discriminated result instead of throwing: the same flow is
// mounted by the admin console and by an expert's sandbox panel, which authorize the caller in
// completely different ways and address the template by slug on one side, by id on the other.
export type CaptureActions = {
    listSources: () => Promise<CaptureSourcesResult>
    plan: (input: { spaceId: string; agentIds: string[] }) => Promise<CapturePlanResult>
    capture: (input: { spaceId: string; selections: CaptureSelection[] }) => Promise<CaptureRunResult>
}
