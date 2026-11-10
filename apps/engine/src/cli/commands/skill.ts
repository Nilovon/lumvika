import { listSkills } from '../../skills/loader.js'

export async function skillCommand(args: string[]): Promise<void> {
    const sub = args[0]
    if (sub === 'list') {
        const id = args[1]
        if (!id) throw new Error('Usage: lumvika skill list <agentId>')
        const skills = await listSkills(id)
        for (const s of skills) process.stdout.write(`${s.slug}\t${s.name}\n`)
        return
    }
    throw new Error('Usage: lumvika skill <list>')
}
