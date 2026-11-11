import 'server-only'

import type { Json } from '@/app/api/database.types'
import type { WorkspaceContext } from '@/app/api/_auth/ownership'
import { ensureWorkspaceNamed } from '@/app/api/_services/naming.service'
import { requestCompanyBrainSeed, requestCompanyExplore } from '@/lib/brain/request-seed'
import { companySiteUrl } from '@/lib/company/firecrawl'
import { asString, asStringArray } from '@/lib/mcp/args'
import { isTemplateCategory } from '@/lib/onboarding/industries'
import { eq, selectMaybeSingle, updateRows, upsertRows } from '@/lib/db'
import { authUsers } from '@lumvika/db/schema'
import { stewardUseCases } from './phase'
import type { StewardAnswers, StewardProfile } from './phase'

// The one place the profile is written. Two surfaces fill it: the welcome card, which asks the four
// fields itself before the model has said anything, and `save_profile`, which is what is left for a
// conversation that got there another way. They have to agree down to the stamps: the workspace
// name, the onboarding date the lifecycle emails key off, and `profileAt`, which is what moves the
// funnel out of discovery.
//
// The profile and the date belong to the workspace, not to whoever filled them in: a workspace is
// onboarded once, when it is created, and a member invited later inherits it rather than owing it.

export async function readAnswers(ctx: WorkspaceContext): Promise<StewardAnswers> {
    const { data } = await selectMaybeSingle(ctx.scope, 'workspace_onboarding', ['answers'] as const, { workspace_id: ctx.workspace.id })
    const value = data?.answers
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as StewardAnswers) : {}
}

export async function writeAnswers(ctx: WorkspaceContext, answers: StewardAnswers, completed: boolean): Promise<void> {
    const { error } = await upsertRows(ctx.scope, 'workspace_onboarding', { workspace_id: ctx.workspace.id, answers: answers as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: ['workspace_id'] })
    if (error) throw new Error(error.message)
    if (completed) await stampWorkspaceOnboarded(ctx)
}

// Never over an earlier date: the first stamp is the day the workspace was onboarded.
export async function stampWorkspaceOnboarded(ctx: WorkspaceContext): Promise<void> {
    const { error } = await updateRows(ctx.scope, 'workspaces', { onboarded_at: new Date().toISOString() }, { id: ctx.workspace.id, onboarded_at: { isNull: true } })
    if (error) throw new Error(error.message)
}

export async function mergeSteward(ctx: WorkspaceContext, patch: StewardProfile): Promise<StewardAnswers> {
    const answers = await readAnswers(ctx)
    const next: StewardAnswers = { ...answers, steward: { ...answers.steward, ...patch } }
    await writeAnswers(ctx, next, false)
    return next
}

// The name an account is born with before it says its own: the anonymous sign-in names every
// visitor so, and claiming an address keeps it.
const PLACEHOLDER_NAME = 'Anonymous'

// The name lives on the auth user, because that is where every other surface reads it from. It is
// only written when nothing holds a real name yet, so a Google account keeps the full one it arrived with.
async function saveFirstName(ctx: WorkspaceContext, firstName: string): Promise<void> {
    const current = ctx.authUser.name.trim()
    if (!ctx.authUser.isAnonymous && current && current !== PLACEHOLDER_NAME) return
    await ctx.scope.run(db => db.update(authUsers).set({ name: firstName, updatedAt: new Date() }).where(eq(authUsers.id, ctx.userId)))
}

export async function saveStewardProfile(ctx: WorkspaceContext, args: Record<string, unknown>): Promise<StewardAnswers> {
    const answers = await readAnswers(ctx)
    const industry = asString(args.industry)
    const tools = asStringArray(args.tools)

    // A second save_profile, the catch-up one the model sometimes sends with a subset of arguments,
    // must not empty the list: an absent use_cases falls back on what was already written, where an
    // empty array would wipe out every agent the plan is about to be made of.
    const useCases = asStringArray(args.use_cases)
    const picked = useCases.length ? useCases : stewardUseCases(answers.steward ?? {})

    const next: StewardAnswers = {
        ...answers,
        company_url: asString(args.company_url) ?? answers.company_url,
        company_name: asString(args.company_name) ?? answers.company_name,
        company_description: asString(args.company_description) ?? answers.company_description,
        company_offering: asString(args.company_offering) ?? answers.company_offering,
        company_audience: asString(args.company_audience) ?? answers.company_audience,
        industry: industry && isTemplateCategory(industry) ? industry : answers.industry,
        position: asString(args.position) ?? answers.position,
        tools: tools.length ? tools : answers.tools,
        steward: {
            ...answers.steward,
            useCases: picked.length ? picked : undefined,
            pain: picked[0] ?? answers.steward?.pain,
            language: asString(args.language) ?? answers.steward?.language,
            profileAt: answers.steward?.profileAt ?? new Date().toISOString(),
        },
    }

    // Stamped here rather than at the end of the funnel: this is the moment the survey used to call
    // done, and the lifecycle emails that chase an unfinished onboarding key off it.
    await writeAnswers(ctx, next, true)

    const firstName = asString(args.first_name)
    if (firstName) await saveFirstName(ctx, firstName).catch(err => console.error('Error saving the first name', err))

    // After the first name: the exploration looks for the person on LinkedIn by it. Never for an
    // anonymous visitor, whose answers are not written anyway: the paid sources wait for an account.
    const companyUrl = next.company_url ? companySiteUrl(next.company_url) : null
    if (companyUrl && !ctx.authUser.isAnonymous) await requestCompanyExplore(ctx.scope, ctx.workspace.id, companyUrl).catch(err => console.error('Failed to request a company exploration', ctx.workspace.id, err))

    // The Company Brain is seeded when the machine is claimed, which for a workspace that installed
    // before it was known happened with no website to read: that seed found nothing, so this is
    // the one that fills it. Its own key, the first one is spent.
    if (companyUrl && next.steward?.installedFirst && !answers.steward?.profileAt && !ctx.authUser.isAnonymous) await requestCompanyBrainSeed(ctx.workspace.id, `brain-seed-${ctx.workspace.id}-profile`)

    // Names the workspace and takes its icon from the site, exactly as the survey did on its way out.
    await ensureWorkspaceNamed({ workspaceId: ctx.workspace.id, userId: ctx.userId })

    return next
}
