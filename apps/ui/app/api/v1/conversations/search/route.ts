import { z } from 'zod'

import { searchWorkspaceConversations } from '@/app/api/_services/conversation.service'
import { apiRoute } from '@/app/api/v1/_lib/api-route'

export const dynamic = 'force-dynamic'

const querySchema = z.object({ q: z.string().max(200).default(''), agentId: z.string().optional() })

// The conversations of the workspace found by their title, as the web's control center finds them.
export const GET = apiRoute({ auth: 'member', query: querySchema }, async ({ ctx, query }) => searchWorkspaceConversations(ctx, query.q, query.agentId))
