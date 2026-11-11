import 'server-only'

import { actorFromContext, workspaceActor, type Actor } from '@/app/api/_auth/access'
import type { WorkspaceContext } from '@/app/api/_auth/ownership'
import { analyzeCompanyProfile } from '@/lib/company/profile'
import { asString, requireString } from '@/lib/mcp/args'
import { installAgentShare, type AgentShareInstallOutcome } from '@/lib/agents/share-install'
import { selectMany, selectMaybeSingle, serviceScope } from '@/lib/db'
import { installTemplate, type TemplateInstallOutcome } from '@/lib/templates/install'
import { hasTemplateEntitlement, templateAccessByWorkspace } from '@/lib/templates/entitlement'
import { LIBRARY_COLUMNS, toLibraryTemplates, type LibraryRow, type LibraryTemplate } from '@/lib/templates/library'
import { revisedJob, type RevisedJob } from './needs'
import { readPlanBoxes, readPlanItems } from './plan-items'
import { mergeSteward, saveStewardProfile } from './profile'
import { startAgentSetup } from './setup-handoff'
import type { StewardPlan, StewardProfile } from './phase'
import type { PlanItemKind } from './tool-defs'

// The gestes the onboarding needs and the rest of the app already had, none of which existed as a
// tool: reading a company website, remembering what was said, showing the library, writing down the
// team that was agreed, and installing it. The phase decides which of them are on the belt.
//
// Writing the profile itself lives in ./profile, because the welcome card writes the same row
// without going through a model at all.

// Only what fits in a chat. The full LibraryTemplate carries a long description, a gallery and an
// editorial agent list, and the model never needs any of it to pick three candidates.
type TemplateBrief = { slug: string; title: string; tagline: string; category: string; agents: number; connectors: string[]; setupMinutes: number }

const TEMPLATE_LIMIT = 8

// What the tools acting on the workspace rather than on the person read. The engine steward calls
// them with no session behind it, as the account owner.
// `actor` is whose access an install runs with: the member behind a steward turn, or, left out, the
// workspace itself.
export type WorkspaceActor = Pick<WorkspaceContext, 'scope' | 'userId'> & { workspace: Pick<WorkspaceContext['workspace'], 'id'>; actor?: Actor }

async function saveProfile(ctx: WorkspaceContext, args: Record<string, unknown>): Promise<unknown> {
    const profile = await saveStewardProfile(ctx, args)

    // The step that follows this call is the next phase already, with its own instructions and its
    // own belt. Saying so in the result as well is deliberate: a model weighs what a tool just
    // answered more heavily than a system prompt that changed under it mid-turn, and this is one of
    // the two places where the turn used to die in silence.
    // Their coworker was installed before this card: nothing is left to design, and the turn ends
    // with the onboarding.
    if (profile.steward?.installedFirst) return { saved: true, profile, next: 'That was the last thing missing: their coworker is already installed and running its own setup. Stop here, with one line saying you now know who they are and that you stay around if they need anything.' }

    return { saved: true, profile, next: 'Discovery is done. Keep going in the same turn: this is now the plan step, so design the one coworker for the job their company visibly does every week and read it back with show_plan. Nothing is created yet.' }
}

function brief(template: LibraryTemplate): TemplateBrief {
    return {
        slug: template.slug,
        title: template.title,
        tagline: template.tagline,
        category: template.category,
        agents: template.archiveAgentNames.length,
        connectors: template.connectors.map(connector => connector.slug),
        setupMinutes: template.setupMinutes,
    }
}

// What the onboarding is allowed to offer: templates that install on the plan alone. A paid one
// would mean asking for a second payment before the first agent has ever run.
async function listTemplates(ctx: WorkspaceActor, args: Record<string, unknown>): Promise<unknown> {
    const category = asString(args.category)
    const query = asString(args.query)?.toLowerCase()

    const [{ data }, access] = await Promise.all([selectMany(ctx.scope, 'templates', LIBRARY_COLUMNS, { status: 'published', show_in_library: true }, { column: 'published_at', ascending: false }), templateAccessByWorkspace(ctx.scope, ctx.workspace.id)])

    const templates = toLibraryTemplates((data ?? []) as LibraryRow[], ctx.userId, access)
        .filter(template => template.owned && template.archiveAgentNames.length > 0)
        .filter(template => (category ? template.category === category : true))
        .filter(template => (query ? `${template.title} ${template.tagline} ${template.tags.join(' ')}`.toLowerCase().includes(query) : true))

    // Featured first when nothing else separates them: it is the editorial order the library shows.
    const ranked = [...templates].sort((a, b) => Number(b.featured) - Number(a.featured))
    return { templates: ranked.slice(0, TEMPLATE_LIMIT).map(brief), total: ranked.length }
}

export type WrittenPlan = Pick<StewardProfile, 'plan' | 'planAt' | 'installedFirst'> & Partial<RevisedJob>

// The organisation the user has just confirmed on the plan card, written down by the app rather than
// restated by the model: the card's own input is the plan, so there is nothing left to retype.
// `interview` is the profile the card was drawn from, rewritten in the same write when the card came
// back on another job. Answers with everything it wrote, for the build of the same turn to read.
export async function writePlan(ctx: WorkspaceContext, shown: unknown, kinds: readonly PlanItemKind[], asked: string | null = null, installedFirst = false, interview: StewardProfile | null = null): Promise<WrittenPlan> {
    const args = (shown ?? {}) as Record<string, unknown>
    const items = readPlanItems(args.items, kinds).map(item => (asked && item.kind === 'agent' ? { ...item, asked } : item))
    if (!items.length) throw new Error('A plan needs its one item: the coworker for the job they picked, with its name and its role.')

    const plan: StewardPlan = { title: asString(args.title) ?? 'Your first coworker', items, boxes: readPlanBoxes(args.boxes) }
    const revised = interview ? revisedJob(interview, items[0]) : null
    const written: WrittenPlan = { plan, planAt: new Date().toISOString(), ...(installedFirst ? { installedFirst } : {}), ...revised }
    await mergeSteward(ctx, written)
    return written
}

// `purchased` is the build's: it installs the template the plan was written from, which the
// workspace bought on its way here. The assistant's own tool stays on what the plan alone covers.
export async function installFromLibrary(ctx: WorkspaceActor, args: Record<string, unknown>, { purchased = false }: { purchased?: boolean } = {}): Promise<TemplateInstallOutcome> {
    const slug = requireString(args.slug, 'slug')
    const boxId = requireString(args.boxId, 'boxId')

    const { data: space } = await selectMaybeSingle(ctx.scope, 'spaces', ['id'] as const, { id: boxId, workspace_id: ctx.workspace.id })
    if (!space) throw new Error(`No Box with id ${boxId} in this workspace.`)

    const { data: template } = await selectMaybeSingle(ctx.scope, 'templates', ['id', 'pricing_model', 'creator_id'] as const, { slug })
    if (!template) throw new Error(`No template found with slug "${slug}"`)
    if (template.pricing_model !== 'free') {
        if (!purchased) throw new Error(`"${slug}" is a paid template. Build the coworkers yourself with create_agent instead of installing it.`)
        if (!(await hasTemplateEntitlement(ctx.scope, ctx.workspace.id, template, ctx.userId))) throw new Error(`"${slug}" has not been bought for this workspace yet.`)
    }

    // Reported whole: a template that lands three agents out of four is a sentence the steward has
    // to say, not a failure to swallow.
    return installTemplate(ctx.scope, slug, { workspaceId: ctx.workspace.id, spaceId: boxId, actor: ctx.actor ?? workspaceActor(ctx.workspace.id) })
}

// The mirror of install_template, for a link that carries one agent. installAgentShare re-checks
// the plan itself, so a workspace without one is refused here too rather than half-installed.
export async function installFromShare(ctx: WorkspaceActor, args: Record<string, unknown>): Promise<AgentShareInstallOutcome> {
    const token = requireString(args.token, 'token')
    const boxId = requireString(args.boxId, 'boxId')

    const { data: space } = await selectMaybeSingle(ctx.scope, 'spaces', ['id'] as const, { id: boxId, workspace_id: ctx.workspace.id })
    if (!space) throw new Error(`No Box with id ${boxId} in this workspace.`)

    return installAgentShare(serviceScope(), token, { workspaceId: ctx.workspace.id, spaceId: boxId, actor: ctx.actor ?? workspaceActor(ctx.workspace.id) })
}

export async function dispatchWorkspaceOnboardingTool(ctx: WorkspaceActor, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case 'analyze_website':
            return analyzeCompanyProfile(requireString(args.url, 'url'))
        case 'list_templates':
            return listTemplates(ctx, args)
        case 'install_template':
            return installFromLibrary(ctx, args)
        case 'install_shared_agent':
            return installFromShare(ctx, args)
        case 'start_agent_setup':
            return startAgentSetup(ctx, args)
        default:
            throw new Error(`Unknown tool: ${name}`)
    }
}

export async function dispatchOnboardingTool(ctx: WorkspaceContext, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case 'save_profile':
            return saveProfile(ctx, args)
        default:
            return dispatchWorkspaceOnboardingTool({ ...ctx, actor: actorFromContext(ctx) }, name, args)
    }
}
