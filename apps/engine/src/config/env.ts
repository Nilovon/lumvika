import { z } from 'zod'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const schema = z.object({
    LUMVIKA_DATA_DIR: z.string().default(resolve(homedir(), '.lumvika')),
    LUMVIKA_PORT: z.coerce.number().int().positive().default(3000),
    LUMVIKA_HOST: z.string().default('0.0.0.0'),
    LUMVIKA_API_KEY: z.string().optional(),
    LUMVIKA_HUB_BASE_URL: z.preprocess(v => (v === '' ? undefined : v), z.string().url().optional()),
    LUMVIKA_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    // Absolute path to the Codex CLI. Set it when the binary is not on the service user's PATH,
    // or to keep the provider's bundled @openai/codex in node_modules/.bin from shadowing it.
    LUMVIKA_CODEX_PATH: z.string().optional(),
    // `on` opens the desktop of the agents on this box ahead of the release, `off` keeps it shut after.
    LUMVIKA_DESKTOP: z.string().optional(),
})

export type Env = z.infer<typeof schema>

let cached: Env | null = null

export function env(): Env {
    if (cached) return cached
    const parsed = schema.safeParse(process.env)
    if (!parsed.success) {
        const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
        throw new Error(`Invalid environment: ${issues}`)
    }
    cached = parsed.data
    return cached
}

// The key and the hub of a server that paired itself are only known once the data-dir is read,
// after the first modules have read the environment: they are set here, on both copies.
export function setEnv(values: Partial<Pick<Env, 'LUMVIKA_API_KEY' | 'LUMVIKA_HUB_BASE_URL'>>): void {
    for (const [key, value] of Object.entries(values)) if (value !== undefined) process.env[key] = value
    if (cached) cached = { ...cached, ...values }
}

// Until the desktop is released a box has no screen, no computer tools and installs none of its
// packages. Flipping this opens it on every box at its next update.
const DESKTOP_RELEASED = true

export function desktopEnabled(): boolean {
    const flag = env().LUMVIKA_DESKTOP
    return flag === 'on' || (DESKTOP_RELEASED && flag !== 'off')
}
