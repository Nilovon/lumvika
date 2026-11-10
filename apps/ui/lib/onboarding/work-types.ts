import type { TemplateCategory } from '@lumvika/contracts'

// The job function the survey asked before the company website replaced it. Nothing writes these
// any more: they are kept so a user row from that version still promotes the right template
// category when the library opens.
export const WORK_TYPES = [
    'business-owner',
    'software-engineering',
    'finance',
    'product',
    'marketing',
    'consulting',
    'operations',
    'sales',
    'engineering',
    'healthcare',
    'legal',
    'student',
    'educator',
] as const
export type WorkType = (typeof WORK_TYPES)[number]

// Job function mapped onto the template library's audience taxonomy, which is what `orderByCategory`
// promotes. `other` is its documented no-op, so a work type that says nothing about the line of
// business promotes nothing rather than promoting the wrong thing.
const TEMPLATE_CATEGORY_BY_WORK_TYPE: Record<WorkType, TemplateCategory> = {
    'business-owner': 'other',
    'software-engineering': 'saas',
    finance: 'productivity',
    product: 'saas',
    marketing: 'creators',
    consulting: 'agencies',
    operations: 'productivity',
    sales: 'sales',
    engineering: 'saas',
    healthcare: 'other',
    legal: 'legal',
    student: 'productivity',
    educator: 'creators',
}

// Takes a plain string, not a `WorkType`: the stored answer comes back out of a jsonb column, so it
// is whatever was written there once, including the literal 'other' and any label a later revision
// of the list drops. Anything unrecognised promotes nothing.
export function workTypeTemplateCategory(workType: string | null | undefined): TemplateCategory | null {
    if (!workType || !isWorkType(workType)) return null
    return TEMPLATE_CATEGORY_BY_WORK_TYPE[workType]
}

export function isWorkType(value: string): value is WorkType {
    return (WORK_TYPES as readonly string[]).includes(value)
}
