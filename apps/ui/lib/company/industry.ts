import { TEMPLATE_CATEGORIES, type TemplateCategory } from '@rerun/contracts'

// The library's own labels are written for someone browsing it ("SaaS", "Other") and read as too
// narrow to a model: on them alone Stripe buckets to "other". These say what line of business each
// one covers instead.
//
// One taxonomy for the two readers of a company: the fast decision that only needs the bucket, and
// the full analysis that also writes the prose. A second wording beside this one would quietly send
// the same company to two different industries depending on which one answered first.
export const INDUSTRY_GLOSS: Record<TemplateCategory, string> = {
    agencies: 'agencies delivering work for clients, advertising, marketing, design and consulting firms included',
    ecommerce: 'brands, shops and marketplaces selling products online',
    saas: 'software products, apps, developer tools, APIs and online platforms',
    sales: 'businesses whose core motion is outbound sales or a CRM-driven pipeline',
    recruiting: 'hiring, staffing, recruitment and talent',
    'real-estate': 'property, brokerage, rentals and construction',
    legal: 'law firms, legal services, compliance and contracts',
    creators: 'media, publishers, newsletters, content businesses and personal brands',
    productivity: 'internal operations, back office and workplace tooling',
    other: 'none of the above genuinely fits',
}

export const INDUSTRY_GUIDE = TEMPLATE_CATEGORIES.map(category => `- "${category}": ${INDUSTRY_GLOSS[category]}`).join('\n')
