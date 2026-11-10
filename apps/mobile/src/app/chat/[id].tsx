import { STEWARD_AGENT_ID, ROUTE_ID_PATTERN } from '@lumvika/contracts'
import { Redirect, useLocalSearchParams } from 'expo-router'

import { CoworkerChat } from '@/components/chat/CoworkerChat'
import { StewardChat } from '@/components/chat/StewardChat'

const NEW = 'new'

// `id` is a conversation, `new`, or `last` for the Steward; `to` names the coworker, the Steward when
// it is left out. Both land in hub paths, so a link with anything else in them opens the home instead.
export default function Chat() {
    const { id, to } = useLocalSearchParams<{ id: string; to?: string }>()
    if (!ROUTE_ID_PATTERN.test(id) || (to !== undefined && !ROUTE_ID_PATTERN.test(to))) return <Redirect href="/" />
    const sessionId = id === NEW ? null : id
    if (!to || to === STEWARD_AGENT_ID) return <StewardChat sessionId={sessionId} />
    return <CoworkerChat agentId={to} sessionId={sessionId} />
}
