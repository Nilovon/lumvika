import { type ToolSet } from 'ai'
import { makeFsTools } from './fsTools.js'
import { workspaceDir } from '../../config/paths.js'
import type { RunContext } from '../../runtime/context.js'

export function filesystemTools(ctx: RunContext): ToolSet {
    return makeFsTools({ prefix: 'fs', label: 'coworker workspace', rootDir: workspaceDir(ctx.agent.id) })
}
