import type { OnboardingAnswers } from '@/app/actions/onboarding'
import { asTitle } from '@/lib/naming/workspace-name'
import { boxNameSuggestions, DEFAULT_BOX_NAMES } from '@/lib/onboarding/box-name-suggestions'
import { workTypeTemplateCategory } from '@/lib/onboarding/work-types'

// Long enough for a real company name, short enough that the label on an iso tile stays a label.
const MAX_LENGTH = 60

// The line of business the onboarding read off the user's website, with two fallbacks behind it: the
// work type the survey asked before it, and the `sector` its three-question version stored before
// that. Returns a plain string, not a `TemplateCategory`: the value comes back out of a jsonb
// column, so it is whatever was written there once, including a label a later revision drops.
export function industryFromAnswers(answers: unknown): string | null {
    const stored = answers as OnboardingAnswers | null | undefined
    return stored?.industry ?? workTypeTemplateCategory(stored?.work_type) ?? stored?.sector ?? null
}

// The name a Box falls back on when nothing is known about the person behind it. Same list as the
// suggestions offered under the name field, so the automatic name and the pills can never drift into
// two different ideas of what a Box is for.
export function firstBoxName(industry: string | null | undefined, taken: string[]): string {
    return boxNameSuggestions(industry, taken)[0] ?? DEFAULT_BOX_NAMES[0]
}

// Always a name, never null: this is what makes "a Box cannot be created unnamed" true at the one
// place a Box is created, rather than a promise each caller has to keep.
export function boxNameFrom(input: { companyName?: string | null; firstName?: string | null; industry?: string | null; taken: string[] }): string {
    const name = input.companyName?.trim() || asTitle(input.firstName ?? '')
    if (name) return name.length > MAX_LENGTH ? name.slice(0, MAX_LENGTH).trimEnd() : name
    return firstBoxName(input.industry, input.taken)
}

export function companyNameFromAnswers(answers: unknown): string | null {
    return (answers as OnboardingAnswers | null | undefined)?.company_name?.trim() || null
}
