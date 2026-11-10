import type { StewardBrief, StewardToolSpec } from '@lumvika/contracts'

import type { StewardState } from './phase'
import { stewardEngineInstructions } from './prompt'
import { STEWARD_BOX_TOOL_DEFS, STEWARD_CLIENT_TOOL_DEFS, STEWARD_DOCS_TOOL_DEFS, STEWARD_MCP_TOOL_NAMES, STEWARD_ONBOARDING_TOOL_DEFS, accountToolDef, type StewardClientToolName, type StewardToolDef } from './tool-defs'

// The belt of the steward that runs on the engine. Everything the hub executes goes through
// POST /api/hub; the board gestures only reach the browser, as transient data parts, so nothing
// here waits on the user except the engine's own ask_user and request_approval. Its files, shell,
// web and sub-agents are the engine's own builtins, not declared here.
//
// Left out on purpose: the widgets (a plan card, a checkout), which the engine cannot render, the
// attachment tools, since a file sent to it lands in its own workspace where its fs_ tools already
// read it, and the onboarding writes (profile, needs), which belong to a person going through
// it on the hub, never to the steward that takes over once the team is built.

const ENGINE_INTENT_TOOL_NAMES = new Set<StewardClientToolName>(['focus_agent', 'show_agents', 'open_settings', 'open_connector_setup', 'open_template_card', 'recenter_board', 'open_brain_page'])

export const STEWARD_ENGINE_ONBOARDING_TOOL_NAMES: ReadonlySet<string> = new Set(['analyze_website', 'list_templates', 'install_template', 'install_shared_agent', 'start_agent_setup'])

// createAgent and createBoxes read then write without a transaction: two in the same step would
// take the same handle, the same cell, or the same free slot of the plan. An install creates agents
// the same way.
const SERIAL_TOOL_NAMES = new Set<string>(['create_agent', 'create_boxes', 'install_template', 'install_shared_agent'])

const HUB_TOOL_DEFS: StewardToolDef[] = [...STEWARD_MCP_TOOL_NAMES.map(accountToolDef), ...STEWARD_BOX_TOOL_DEFS, ...STEWARD_DOCS_TOOL_DEFS, ...STEWARD_ONBOARDING_TOOL_DEFS.filter(def => STEWARD_ENGINE_ONBOARDING_TOOL_NAMES.has(def.name))]

export const STEWARD_ENGINE_HUB_TOOL_NAMES: ReadonlySet<string> = new Set(HUB_TOOL_DEFS.map(def => def.name))

function spec(def: StewardToolDef, kind: StewardToolSpec['kind']): StewardToolSpec {
    return { name: def.name, description: def.description, inputSchema: def.inputSchema as Record<string, unknown>, kind, serial: SERIAL_TOOL_NAMES.has(def.name) }
}

export function stewardEngineBrief(state: StewardState): StewardBrief {
    return {
        instructions: stewardEngineInstructions(state),
        tools: [...HUB_TOOL_DEFS.map(def => spec(def, 'hub')), ...STEWARD_CLIENT_TOOL_DEFS.filter(def => ENGINE_INTENT_TOOL_NAMES.has(def.name)).map(def => spec(def, 'intent'))],
    }
}
