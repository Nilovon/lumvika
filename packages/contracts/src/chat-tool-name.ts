// Both CLI providers reach the builtin tools through the bridged `lumvika` MCP server, which
// namespaces their names. The engine only canonicalizes the HITL ones (widening that would make
// `lastStepHasHitlCall` stop the turn), so every other reader strips the prefix here.
const BRIDGE_PREFIX = /^(?:mcp__)?lumvika__/

export function stripBridgePrefix(name: string): string {
    return name.replace(BRIDGE_PREFIX, '')
}
