import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { STEWARD_AGENT_ID, TOOL_KEYS, type AgentConfig, type ToolKey } from '@lumvika/contracts'
import { configPath, soulPath, workspaceDir } from '../config/paths.js'
import { writeAgentConfig } from './config-write.js'
import { agentConfigSchema } from './types.js'
import { unloadAgent } from './registry.js'

// Only what the hub does not send: the brief of each chat request replaces it. A run that reaches
// the steward without a brief (an old hub, a direct call) still has something coherent to say.
const STEWARD_SOUL = `# Steward

You are the Steward of this Lumvika workspace: the assistant that sets up and runs the user's team of coworkers from outside the board. Answer in the user's language, lead with the result, and keep it short.
`

// The orchestrator works on the box like any agent (files, shell, web, sub-agents, the company
// brain, which it keeps rather than proposes to) and on the account through the tools the hub hands
// it. What stays off is everything of its own it would keep between conversations (memory, skills,
// schedules, triggers, connectors). Of the cards it keeps only the file tiles: the user cannot reach
// the server, so a file it made is seen there or not at all.
const STEWARD_TOOL_KEYS = new Set<ToolKey>(['filesystem', 'shared', 'shell', 'web', 'sharedDb', 'brain', 'delegate', 'callAgent', 'browser', 'vision', 'askUser', 'requestApproval', 'cards'])

function stewardConfig(modelPin: ModelPin): AgentConfig {
    const tools = Object.fromEntries(TOOL_KEYS.map(key => [key, STEWARD_TOOL_KEYS.has(key)]))
    return agentConfigSchema.parse({
        ...modelPin,
        name: STEWARD_AGENT_ID,
        kind: 'steward',
        displayName: 'Steward',
        tools,
        selfImprovement: { enabled: false, allowToolInstall: false, allowSoulEdit: false, autoMemory: false },
        setup: { required: false },
    })
}

type ModelPin = Pick<AgentConfig, 'connectionId' | 'provider' | 'model'>

// The model is the one thing the user picks for the steward, as for any agent, so it is the one
// thing a reboot keeps.
async function currentModelPin(): Promise<ModelPin> {
    try {
        const { connectionId, provider, model } = agentConfigSchema.parse(JSON.parse(await readFile(configPath(STEWARD_AGENT_ID), 'utf8')))
        return { connectionId, provider, model }
    } catch {
        return { connectionId: null, provider: null, model: null }
    }
}

// Rewritten from code on every boot rather than created once, so each engine update ships the
// steward it was built with. Deliberately never inserted in the agent index.
export async function ensureSteward(): Promise<void> {
    await mkdir(workspaceDir(STEWARD_AGENT_ID), { recursive: true })
    await writeAgentConfig(STEWARD_AGENT_ID, stewardConfig(await currentModelPin()))
    await writeFile(soulPath(STEWARD_AGENT_ID), STEWARD_SOUL, 'utf8')
    unloadAgent(STEWARD_AGENT_ID)
}
