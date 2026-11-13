import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { ASSISTANT_AGENT_ID, TOOL_KEYS, type AgentConfig, type ToolKey } from '@lumvika/contracts'
import { configPath, soulPath, workspaceDir } from '../config/paths.js'
import { writeAgentConfig } from './config-write.js'
import { agentConfigSchema } from './types.js'
import { unloadAgent } from './registry.js'

const ASSISTANT_SOUL = `# Assistant

You are the assistant of this Lumvika workspace, the plain Chat any member opens to think, write, research or ask a question. You are helpful, direct and concise: lead with the answer, then the detail the question needs.
`

// What the config says it has. The tools themselves come from ASSISTANT_TOOL_NAMES in
// tools/assistant.ts, whatever these flags read: a family added later stays off here by default.
const ASSISTANT_TOOL_KEYS = new Set<ToolKey>(['web', 'brain'])

function assistantConfig(modelPin: ModelPin): AgentConfig {
    const tools = Object.fromEntries(TOOL_KEYS.map(key => [key, ASSISTANT_TOOL_KEYS.has(key)]))
    return agentConfigSchema.parse({
        ...modelPin,
        name: ASSISTANT_AGENT_ID,
        kind: 'assistant',
        displayName: 'Assistant',
        tools,
        mcpServers: [],
        selfImprovement: { enabled: false, allowToolInstall: false, allowSoulEdit: false, autoMemory: false },
        setup: { required: false },
    })
}

type ModelPin = Pick<AgentConfig, 'connectionId' | 'provider' | 'model'>

// The workspace default model of the Chat is the one thing kept across a reboot, as for the steward.
async function currentModelPin(): Promise<ModelPin> {
    try {
        const { connectionId, provider, model } = agentConfigSchema.parse(JSON.parse(await readFile(configPath(ASSISTANT_AGENT_ID), 'utf8')))
        return { connectionId, provider, model }
    } catch {
        return { connectionId: null, provider: null, model: null }
    }
}

// Rewritten from code on every boot, never inserted in the agent index: an agent folder like any
// other, so no data-dir step is needed for it.
export async function ensureAssistant(): Promise<void> {
    await mkdir(workspaceDir(ASSISTANT_AGENT_ID), { recursive: true })
    await writeAgentConfig(ASSISTANT_AGENT_ID, assistantConfig(await currentModelPin()))
    await writeFile(soulPath(ASSISTANT_AGENT_ID), ASSISTANT_SOUL, 'utf8')
    unloadAgent(ASSISTANT_AGENT_ID)
}
