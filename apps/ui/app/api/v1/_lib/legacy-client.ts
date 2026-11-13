import { CLIENT_HEADER, type AgentModels, type AgentView, type AiConnectionsView, type Provider } from '@lumvika/contracts'

// The iOS builds already in people's hands parse `providerSchema` strictly: one provider they do not
// know anywhere in a response fails the whole parse, and with it as the machine's default that is
// every coworker's sheet. Until the build that knows a provider is the minimum, the routes those
// builds read leave it out. Each provider names the env var holding its first build; unset, every
// build is treated as one that does not know it.
const FIRST_IOS_BUILD_ENV: Partial<Record<Provider, string>> = {
    opencode: 'MOBILE_IOS_OPENCODE_BUILD',
    custom: 'MOBILE_IOS_CUSTOM_BUILD',
}

const PROVIDERS_UNKNOWN_TO_LEGACY = Object.keys(FIRST_IOS_BUILD_ENV) as Provider[]

function firstIosBuild(provider: Provider): number | null {
    const name = FIRST_IOS_BUILD_ENV[provider]
    const build = Number.parseInt((name && process.env[name]) ?? '', 10)
    return Number.isInteger(build) && build > 0 ? build : null
}

const IOS_CLIENT = /^ios\/[^ ]+ \((\d+)\)$/

// A request without the header is an old build: only the app sends it, and only recent ones do.
export function clientKnowsProvider(req: Request, provider: Provider): boolean {
    if (!FIRST_IOS_BUILD_ENV[provider]) return true
    const match = IOS_CLIENT.exec(req.headers.get(CLIENT_HEADER) ?? '')
    const firstBuild = firstIosBuild(provider)
    if (!match || firstBuild === null) return false
    return Number(match[1]) >= firstBuild
}

function unknownTo(req: Request): ((provider: Provider | null | undefined) => boolean) | null {
    const unknown = new Set(PROVIDERS_UNKNOWN_TO_LEGACY.filter(provider => !clientKnowsProvider(req, provider)))
    return unknown.size ? provider => !!provider && unknown.has(provider) : null
}

export function aiConnectionsForClient(req: Request, view: AiConnectionsView): AiConnectionsView {
    const unknownToLegacy = unknownTo(req)
    if (!unknownToLegacy) return view
    return {
        ...view,
        connections: view.connections.filter(connection => !unknownToLegacy(connection.provider)),
        addable: view.addable.filter(entry => !unknownToLegacy(entry.provider)),
    }
}

export function agentModelsForClient(req: Request, models: AgentModels): AgentModels {
    const unknownToLegacy = unknownTo(req)
    if (!unknownToLegacy) return models
    return { ...models, groups: models.groups.filter(group => !unknownToLegacy(group.provider)) }
}

// The agent kinds every build parses. A built-in agent added later (the assistant) has no board row,
// so it never reaches the app; were one to, it reads as an ordinary coworker rather than failing.
const AGENT_KINDS_KNOWN_TO_EVERY_CLIENT: ReadonlySet<string> = new Set(['user', 'steward'])

function withKnownKind(view: AgentView): AgentView {
    if (!view.detail || AGENT_KINDS_KNOWN_TO_EVERY_CLIENT.has(view.detail.config.kind)) return view
    return { ...view, detail: { ...view.detail, config: { ...view.detail.config, kind: 'user' } } }
}

// Both pairs are nullable already: an old build reads them as "follows the machine" and "not
// resolved yet", which is what it can show without knowing the provider.
export function agentViewForClient(req: Request, agentView: AgentView): AgentView {
    const view = withKnownKind(agentView)
    const unknownToLegacy = unknownTo(req)
    if (!unknownToLegacy || !view.detail) return view
    const { detail } = view
    const config = unknownToLegacy(detail.config.provider) ? { ...detail.config, provider: null, model: null } : detail.config
    const resolved = unknownToLegacy(detail.resolvedProvider) ? { resolvedProvider: null, resolvedModel: null } : {}
    return { ...view, detail: { ...detail, config, ...resolved } }
}
