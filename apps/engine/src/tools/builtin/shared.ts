import { type ToolSet } from 'ai'
import { makeFsTools } from './fsTools.js'
import { sharedDir } from '../../config/paths.js'
import type { RunContext } from '../../runtime/context.js'

export function sharedTools(_ctx: RunContext): ToolSet {
    return makeFsTools({ prefix: 'shared', label: 'shared space every coworker can read and write', rootDir: sharedDir() })
}
