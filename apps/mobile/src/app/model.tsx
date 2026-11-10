import { useLocalSearchParams } from 'expo-router'

import { AgentModelSheet } from '@/components/chat/AgentModelSheet'

export default function ModelSheet() {
    const { agent } = useLocalSearchParams<{ agent: string }>()
    return <AgentModelSheet agentId={agent} />
}
