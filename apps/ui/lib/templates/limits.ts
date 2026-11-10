import { SEO_DESCRIPTION_MAX_LENGTH, SEO_DESCRIPTION_MIN_LENGTH, TEMPLATE_TITLE_MAX_LENGTH } from '@lumvika/contracts'
import { copyOf } from '@/lib/copy-name'

// Cheap ceilings: a compromised account cannot flood the table. Keep enough room for expert
// authors to cover the full catalogue instead of blocking them after a few categories. The
// gallery cap matters more since the MCP surface exists, where an append loop has no form to stop
// it.
export const MAX_TEMPLATES_PER_AUTHOR = 100
export const MAX_TEMPLATE_GALLERY_IMAGES = 8

export const TITLE_LIMIT = TEMPLATE_TITLE_MAX_LENGTH
export const TAGLINE_LIMIT = 160
export const META_TITLE_LIMIT = 60
export const META_DESCRIPTION_MIN = SEO_DESCRIPTION_MIN_LENGTH
export const META_DESCRIPTION_LIMIT = SEO_DESCRIPTION_MAX_LENGTH
export const IMAGE_ALT_LIMIT = 125
export const FAQ_QUESTION_LIMIT = 100
export const FAQ_ANSWER_LIMIT = 320
export const FAQ_MIN_ITEMS = 4
export const FAQ_MAX_ITEMS = 6

export function duplicateTemplateTitle(title: string): string {
    return copyOf(title, TITLE_LIMIT)
}
