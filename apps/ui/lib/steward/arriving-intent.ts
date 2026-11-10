'use client'

import type { ReadonlyURLSearchParams } from 'next/navigation'

import { readHeroAgentApps, readHeroAgentName } from '@/lib/onboarding/hero-handoff'
import type { OnboardingState } from '@/stores/onboarding.store'
import type { KickoffIntent, PromptIntent } from './kickoff-marker'

function promptIntent(text: string, name: string | null | undefined, apps: string[] | undefined): PromptIntent {
    return { kind: 'prompt', text, ...(name ? { name } : {}), ...(apps?.length ? { apps } : {}) }
}

// What the visitor came in with, read where it already lives. The parked fields matter as much as
// the query string: HomeContent clears the parameters off the URL as soon as it has stored them,
// and a signup through Google loses the query string entirely, so the store is what survives the
// trip between the landing page and the first conversation.
//
// One at a time, in the order of how explicit they are: a template link names what to install, a
// share link names one agent, a prompt describes a wish.
export function readArrivingIntent(searchParams: ReadonlyURLSearchParams, onboarding: OnboardingState): KickoffIntent | null {
    // Coming back from a template checkout is not an arrival, and the slug in the URL is there to
    // tell the purchase dialog what was bought.
    if (searchParams.has('purchase')) return null

    const slug = searchParams.get('template') ?? onboarding.pendingTemplateLink
    if (slug) return { kind: 'template', slug }

    const token = searchParams.get('share') ?? onboarding.pendingShareLink
    if (token) return { kind: 'share', token }

    // The name and the apps the landing composer read travel with the prompt, and are parked with it.
    const typed = searchParams.get('prompt')?.trim()
    if (typed) return promptIntent(typed, readHeroAgentName(searchParams), readHeroAgentApps(searchParams))

    const parked = onboarding.firstAgentFromPrompt ? onboarding.pendingFirstAgent : null
    return parked?.kickoff ? promptIntent(parked.kickoff, parked.name, parked.serviceSlugs) : null
}
