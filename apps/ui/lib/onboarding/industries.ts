import { isTemplateCategory, type TemplateCategory } from '@lumvika/contracts'

// The connectors we put under "For you" per industry, most recognisable first. Hand written rather
// than derived from `services.category`: that taxonomy is capability shaped, not business shaped,
// and its `productivity` bucket alone holds a third of the catalogue (Linear, Canva, Gusto,
// Perplexity…), so no query over it reads as "the tools an agency uses".
//
// A slug that is disabled or dropped from the catalogue simply renders no tile: this list is a
// display preference, never a dependency.
export const INDUSTRY_TOOLS: Record<TemplateCategory, string[]> = {
    agencies: ['notion', 'slack', 'google-drive', 'google-docs', 'calendly', 'docusign', 'hubspot', 'asana', 'pandadoc', 'gmail', 'fireflies', 'miro'],
    ecommerce: ['shopify', 'stripe', 'klaviyo', 'google-analytics', 'meta-ads', 'mailchimp', 'notion', 'slack', 'gmail', 'airtable', 'google-sheets', 'paypal'],
    saas: ['github', 'linear', 'vercel', 'supabase', 'sentry', 'figma', 'slack', 'notion', 'posthog', 'jira', 'cloudflare', 'amplitude'],
    sales: ['hubspot', 'pipedrive', 'apollo', 'gong', 'outreach', 'lemlist', 'instantly', 'clay', 'slack', 'gmail', 'calendly', 'zoominfo'],
    recruiting: ['linkedin', 'indeed', 'notion', 'gmail', 'google-calendar', 'calendly', 'slack', 'airtable', 'docusign', 'typeform', 'google-sheets', 'google-drive'],
    'real-estate': ['gmail', 'google-calendar', 'docusign', 'notion', 'airtable', 'calendly', 'hubspot', 'pipedrive', 'slack', 'google-sheets', 'jotform', 'dropbox'],
    legal: ['docusign', 'legalzoom', 'pandadoc', 'google-docs', 'notion', 'dropbox', 'gmail', 'slack', 'airtable', 'google-drive', 'jotform', 'smartsheet'],
    creators: ['canva', 'buffer', 'x', 'linkedin', 'beehiiv', 'mailchimp', 'notion', 'metricool', 'google-analytics', 'semrush', 'brevo', 'klaviyo'],
    productivity: ['slack', 'notion', 'airtable', 'monday', 'asana', 'zapier', 'make', 'n8n', 'google-sheets', 'clickup', 'jira', 'gusto'],
    other: [],
}

// Someone whose site told us nothing we can bucket, or who skipped the question, gets the tools
// almost everyone recognises rather than an empty section.
export const DEFAULT_INDUSTRY_TOOLS = ['notion', 'slack', 'gmail', 'google-drive', 'google-sheets', 'google-calendar', 'hubspot', 'stripe', 'github', 'airtable', 'figma', 'zapier']

// Takes a plain string, not a `TemplateCategory`: the stored answer comes back out of a jsonb
// column, so it is whatever was written there once, including a label a later revision drops.
export function toolsForIndustry(industry: string | null | undefined): string[] {
    if (!industry || !isTemplateCategory(industry)) return DEFAULT_INDUSTRY_TOOLS
    const tools = INDUSTRY_TOOLS[industry]
    return tools.length > 0 ? tools : DEFAULT_INDUSTRY_TOOLS
}

export { isTemplateCategory }
