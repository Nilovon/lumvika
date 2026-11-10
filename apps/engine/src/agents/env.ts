import { agentEnvPath } from '../config/paths.js'
import { readEnvFile, writeEnvFile } from '../lib/env-file.js'

export { parseEnvFile, serializeEnv } from '../lib/env-file.js'

export async function readAgentEnv(id: string): Promise<Record<string, string>> {
    return readEnvFile(agentEnvPath(id))
}

export async function writeAgentEnv(id: string, env: Record<string, string>): Promise<void> {
    await writeEnvFile(agentEnvPath(id), env)
}
