import { z } from 'zod'

import { conversationMessageSchema } from './conversation.js'
import { TEMPLATE_CATEGORIES } from './template-display.js'

// The steward lives on every engine under this fixed id, outside the agent index: the board, the
// `call_agent` roster and `GET /agents` never see it.
export const STEWARD_AGENT_ID = 'steward'

// Carries the brief's `hubToken` on the steward's calls to the hub, which signed it: the engine key
// alone does not prove the caller is the steward.
export const STEWARD_HUB_TOKEN_HEADER = 'x-lumvika-steward-token'

// A board gesture the steward asks the browser to make (open a panel, focus an agent). Sent as a
// transient data part so it fires once, live, and never replays when the conversation reloads.
export const STEWARD_INTENT_PART = 'data-steward-intent'
export type StewardIntent = { tool: string; input: unknown }

// `hub` tools run on the hub through POST /api/hub, `intent` tools only emit a board gesture.
// `serial` hub tools never overlap within one engine: two `create_agent` in the same step would
// otherwise race for the same handle and the same cell.
export const stewardToolSpecSchema = z.object({
    name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    description: z.string(),
    inputSchema: z.record(z.string(), z.unknown()),
    kind: z.enum(['hub', 'intent']),
    serial: z.boolean().default(false),
})
export type StewardToolSpec = z.infer<typeof stewardToolSpecSchema>

// What the hub hands the steward on every turn: its instructions and its tools. Both live in the
// hub so that changing either is a hub deploy, never a fleet update.
export const stewardBriefSchema = z.object({
    instructions: z.string().min(1),
    tools: z.array(stewardToolSpecSchema).max(64).default([]),
    hubToken: z.string().min(1).optional(),
})
export type StewardBrief = z.infer<typeof stewardBriefSchema>

// Which steward the workspace talks to: the onboarding's on the hub, the everyday one on the engine, or
// none at all for a workspace past its onboarding with no machine.
export const stewardSurfaceSchema = z.enum(['onboarding', 'engine', 'none'])
export type StewardSurface = z.infer<typeof stewardSurfaceSchema>

export const STEWARD_PHASES = ['waitlist', 'discover', 'plan', 'trial', 'build', 'companion'] as const
export const stewardPhaseSchema = z.enum(STEWARD_PHASES)
export type StewardPhase = z.infer<typeof stewardPhaseSchema>

// Where the onboarding is walked. The app sells nothing, so the hub keeps every price, card and
// payment out of what it says there, and its trial starts without a card.
export const stewardClientSchema = z.enum(['web', 'ios'])
export type StewardClient = z.infer<typeof stewardClientSchema>

// GET /api/chat/steward/state.
export const stewardStateSchema = z.looseObject({ surface: stewardSurfaceSchema, phase: stewardPhaseSchema, firstName: z.string() })
export type StewardStateResponse = z.infer<typeof stewardStateSchema>

// GET /api/chat/steward/engine: the caller's last conversation with the engine's steward, null before
// the first one. With `?sessionId=`, the transcript of that conversation alone.
export const stewardEngineConversationSchema = z
    .looseObject({ sessionId: z.string(), title: z.string().nullable().optional(), messages: z.array(conversationMessageSchema), activeRunId: z.string().nullable().optional() })
    .nullable()
export const stewardEngineMessagesSchema = z.object({ messages: z.array(conversationMessageSchema) })

const templateCategorySchema = z.enum(TEMPLATE_CATEGORIES)

// POST /api/v1/steward/intake: the welcome card's answers, the same four the web card hands over.
// `decidedIndustry` is what POST /api/v1/steward/industry made of the site while they kept answering.
export const stewardIntakeSchema = z.object({
    companyUrl: z.string().trim().max(500).nullable(),
    industry: templateCategorySchema.nullable(),
    decidedIndustry: templateCategorySchema.nullable(),
    industryLabel: z.string().trim().max(200).nullable(),
    position: z.string().trim().max(200).nullable(),
    firstName: z.string().trim().max(100).nullable(),
})
export type StewardIntakeRequest = z.infer<typeof stewardIntakeSchema>
export const stewardIndustryRequestSchema = z.object({ input: z.string().trim().min(1).max(500) })
// The industry the profile was written with, or the fast guess for a site: null when nothing could be told.
export const stewardIndustryResultSchema = z.object({ industry: templateCategorySchema.nullable() })

// POST /api/v1/steward/trial: false when the workspace cannot start one from the app (a trial already spent).
export const stewardTrialResultSchema = z.object({ entitled: z.boolean() })
export type StewardTrialResult = z.infer<typeof stewardTrialResultSchema>

// GET /api/v1/steward/files: whether the engine's steward takes files in its own workspace. A box
// that predates it refuses every upload, so the app offers no attachment there.
export const stewardEngineFilesSchema = z.object({ supported: z.boolean() })
export type StewardEngineFiles = z.infer<typeof stewardEngineFilesSchema>

// POST /api/v1/steward/lead: the install of the coworker the build put first, or the conversation of
// the one already started.
export const stewardLeadRequestSchema = z.object({ agentId: z.string().min(1) })
export const stewardLeadResultSchema = z.object({ conversationId: z.string(), runId: z.string().nullable() })
