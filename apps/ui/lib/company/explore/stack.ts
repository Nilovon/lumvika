import { fetchPublic } from './public-fetch'
import { socialProfiles, type SocialProfiles } from './social'
import type { Collector } from './types'

export type StackFindings = {
    finalUrl: string
    technologies: { name: string; category: string }[]
    meta: {
        title: string | null
        description: string | null
        siteName: string | null
        ogImage: string | null
        themeColor: string | null
        favicon: string | null
        lang: string | null
    }
    social: SocialProfiles
}

type Fingerprint = { name: string; category: string; html?: RegExp; header?: [string, RegExp] }

const FINGERPRINTS: Fingerprint[] = [
    { name: 'Shopify', category: 'E-commerce', html: /cdn\.shopify\.com|Shopify\.theme/, header: ['x-shopid', /./] },
    { name: 'WooCommerce', category: 'E-commerce', html: /woocommerce/i },
    { name: 'PrestaShop', category: 'E-commerce', html: /prestashop/i },
    { name: 'Magento', category: 'E-commerce', html: /Magento_|mage\/cookies/ },
    { name: 'WordPress', category: 'CMS', html: /\/wp-content\/|\/wp-includes\// },
    { name: 'Webflow', category: 'CMS', html: /data-wf-site|assets\.website-files\.com|webflow\.com\/css/ },
    { name: 'Wix', category: 'CMS', html: /static\.wixstatic\.com|static\.parastorage\.com/ },
    { name: 'Squarespace', category: 'CMS', html: /static1\.squarespace\.com|squarespace-cdn\.com/ },
    { name: 'Framer', category: 'CMS', html: /framerusercontent\.com|framer\.com\/m\// },
    { name: 'Ghost', category: 'CMS', html: /content="Ghost \d/ },
    { name: 'Next.js', category: 'Framework', html: /__NEXT_DATA__|\/_next\/static\// },
    { name: 'Nuxt', category: 'Framework', html: /__NUXT__|\/_nuxt\// },
    { name: 'Gatsby', category: 'Framework', html: /___gatsby/ },
    { name: 'HubSpot', category: 'CRM / marketing', html: /js\.hs-scripts\.com|js\.hsforms\.net|js\.hs-analytics\.net/ },
    { name: 'Salesforce Pardot', category: 'CRM / marketing', html: /pi\.pardot\.com|piAId/ },
    { name: 'Pipedrive', category: 'CRM / marketing', html: /leadbooster-chat|pipedriveWebForms/ },
    { name: 'Brevo', category: 'Emailing', html: /sibautomation\.com|sibforms\.com|brevo\.com\/js/ },
    { name: 'Mailchimp', category: 'Emailing', html: /chimpstatic\.com|list-manage\.com/ },
    { name: 'Klaviyo', category: 'Emailing', html: /static\.klaviyo\.com/ },
    { name: 'Intercom', category: 'Chat / support', html: /widget\.intercom\.io|intercomSettings/ },
    { name: 'Crisp', category: 'Chat / support', html: /client\.crisp\.chat/ },
    { name: 'Zendesk', category: 'Chat / support', html: /static\.zdassets\.com/ },
    { name: 'Drift', category: 'Chat / support', html: /js\.driftt\.com/ },
    { name: 'Tawk.to', category: 'Chat / support', html: /embed\.tawk\.to/ },
    { name: 'Gorgias', category: 'Chat / support', html: /gorgias\.chat|config\.gorgias\.io/ },
    { name: 'Stripe', category: 'Paiement', html: /js\.stripe\.com/ },
    { name: 'Paddle', category: 'Paiement', html: /cdn\.paddle\.com/ },
    { name: 'Lemon Squeezy', category: 'Paiement', html: /lemonsqueezy\.com/ },
    { name: 'Calendly', category: 'Prise de RDV', html: /assets\.calendly\.com|calendly\.com\/[a-z0-9-]+/ },
    { name: 'Cal.com', category: 'Prise de RDV', html: /app\.cal\.com|cal\.com\/embed/ },
    { name: 'Doctolib', category: 'Prise de RDV', html: /doctolib\.(fr|de|it)\// },
    { name: 'Planity', category: 'Prise de RDV', html: /planity\.com/ },
    { name: 'Zenchef', category: 'Prise de RDV', html: /zenchef\.com/ },
    { name: 'TheFork', category: 'Prise de RDV', html: /thefork\.|lafourchette\./ },
    { name: 'Typeform', category: 'Formulaires', html: /embed\.typeform\.com|typeform\.com\/to\// },
    { name: 'Tally', category: 'Formulaires', html: /tally\.so\/(r|embed)\// },
    { name: 'Google Analytics', category: 'Analytics', html: /googletagmanager\.com\/gtag\/js|google-analytics\.com\/(analytics|ga)\.js/ },
    { name: 'Google Tag Manager', category: 'Analytics', html: /googletagmanager\.com\/gtm\.js/ },
    { name: 'PostHog', category: 'Analytics', html: /(us|eu)(-assets)?\.i\.posthog\.com|posthog\.init/ },
    { name: 'Plausible', category: 'Analytics', html: /plausible\.io\/js/ },
    { name: 'Segment', category: 'Analytics', html: /cdn\.segment\.com/ },
    { name: 'Mixpanel', category: 'Analytics', html: /cdn\.mxpnl\.com|mixpanel\.init/ },
    { name: 'Hotjar', category: 'Analytics', html: /static\.hotjar\.com/ },
    { name: 'Meta Pixel', category: 'Publicité', html: /connect\.facebook\.net\/[^"']*fbevents|fbq\(/ },
    { name: 'LinkedIn Insight', category: 'Publicité', html: /snap\.licdn\.com|_linkedin_partner_id/ },
    { name: 'TikTok Pixel', category: 'Publicité', html: /analytics\.tiktok\.com/ },
    { name: 'Google Ads', category: 'Publicité', html: /googleadservices\.com|AW-\d{6,}/ },
    { name: 'Trustpilot', category: 'Avis', html: /widget\.trustpilot\.com/ },
    { name: 'Axeptio', category: 'Cookies', html: /axept\.io/ },
    { name: 'Didomi', category: 'Cookies', html: /sdk\.privacy-center\.org|didomi/i },
    { name: 'Cookiebot', category: 'Cookies', html: /consent\.cookiebot\.com/ },
    { name: 'Tarteaucitron', category: 'Cookies', html: /tarteaucitron/ },
    { name: 'Vercel', category: 'Hébergement', header: ['x-vercel-id', /./] },
    { name: 'Netlify', category: 'Hébergement', header: ['x-nf-request-id', /./] },
    { name: 'Cloudflare', category: 'Hébergement', header: ['cf-ray', /./] },
]

export function detectTechnologies(html: string, headers: Headers): StackFindings['technologies'] {
    return FINGERPRINTS.filter(({ html: pattern, header }) => (pattern ? pattern.test(html) : false) || (header ? header[1].test(headers.get(header[0]) ?? '') : false)).map(
        ({ name, category }) => ({ name, category })
    )
}

function metaContent(html: string, key: string): string | null {
    const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i'))?.[0]
    return tag?.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || null
}

function absolute(href: string | null | undefined, base: string): string | null {
    if (!href) return null
    try {
        return new URL(href, base).toString()
    } catch {
        return null
    }
}

export function readPageMeta(html: string, baseUrl: string): StackFindings['meta'] {
    const iconHref = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1]
    return {
        title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null,
        description: metaContent(html, 'description') ?? metaContent(html, 'og:description'),
        siteName: metaContent(html, 'og:site_name') ?? metaContent(html, 'application-name'),
        ogImage: absolute(metaContent(html, 'og:image'), baseUrl),
        themeColor: metaContent(html, 'theme-color'),
        favicon: absolute(iconHref ?? '/favicon.ico', baseUrl),
        lang: html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] ?? null,
    }
}

const MAX_HTML = 2_000_000

export const stackCollector: Collector<'stack'> = {
    id: 'stack',
    needs: [],
    async run({ input }) {
        const res = await fetchPublic(input.url, { accept: 'text/html', timeoutMs: 12_000 })
        if (!res.ok) throw new Error(`The home page answered ${res.status}`)
        const html = (await res.text()).slice(0, MAX_HTML)

        const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(match => match[1])
        const data: StackFindings = {
            finalUrl: res.url,
            technologies: detectTechnologies(html, res.headers),
            meta: readPageMeta(html, res.url),
            social: socialProfiles(hrefs),
        }
        return {
            data,
            highlights: [
                data.technologies.length ? data.technologies.map(tech => tech.name).join(', ') : 'Aucune techno reconnue',
                `Titre : ${data.meta.title ?? '?'}`,
                Object.keys(data.social).length ? `Réseaux : ${Object.keys(data.social).join(', ')}` : 'Aucun lien social dans le HTML',
            ],
        }
    },
}
