import { execFileSync } from 'node:child_process'

const service = (): string => process.env.LUMVIKA_SERVICE ?? 'lumvika'

function privileged(command: string, args: string[]): void {
    const useSudo = process.getuid?.() !== 0
    const file = useSudo ? 'sudo' : command
    const full = useSudo ? [command, ...args] : args
    execFileSync(file, full, { stdio: 'inherit' })
}

export function serviceCommand(action: string, args: string[]): void {
    if (action === 'logs') {
        const follow = !args.includes('--no-follow')
        privileged('journalctl', ['-u', service(), '-n', '200', ...(follow ? ['-f'] : [])])
        return
    }
    privileged('systemctl', [action, service()])
}
