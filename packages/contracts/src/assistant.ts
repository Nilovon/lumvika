import { z } from 'zod'

// The assistant of the plain Chat lives on every engine under this fixed id, outside the agent index
// like the steward: the board, the `call_agent` roster and `GET /agents` never see it. One agent
// serves every member of the workspace, so it keeps nothing between conversations.
export const ASSISTANT_AGENT_ID = 'assistant'

// What the hub hands the assistant with a chat request, for that run only: the project the
// conversation is about, when the person sees it. It reaches the system prompt, never the transcript.
export const assistantBriefSchema = z.object({
    project: z
        .object({
            name: z.string().max(200),
            instructions: z.string().max(20_000),
        })
        .optional(),
})
export type AssistantBrief = z.infer<typeof assistantBriefSchema>
