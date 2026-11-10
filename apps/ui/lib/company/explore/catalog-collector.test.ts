import { afterEach, describe, expect, it, vi } from 'vitest'

import { catalogCollector, htmlToText, MAX_CATALOG_PRODUCTS, rankProducts, readProductPage, readShopifyProduct, readWooProduct, type CatalogProduct } from './catalog-collector'
import type { SiteFindings } from './site'
import type { StackFindings } from './stack'
import { CollectorSkipped, type CollectorContext, type CollectorData } from './types'

vi.mock('./public-fetch', () => ({ fetchPublic: (url: string) => fetch(url) }))

function product(url: string, name = url): CatalogProduct {
    return { name, url, image: null, category: null, tags: [], description: '' }
}

function stackWith(technologies: StackFindings['technologies']): StackFindings {
    return {
        finalUrl: 'https://shop.com/',
        technologies,
        meta: { title: null, description: null, siteName: null, ogImage: null, themeColor: null, favicon: null, lang: null },
        social: {},
    }
}

function siteWith(productUrls: string[], homeProductUrls: string[] = []): SiteFindings {
    return { mappedUrls: 0, pages: [], homeProductUrls, productUrls, failedPages: [], social: {}, linkedinPeople: [], branding: null }
}

function context(stack: StackFindings | null, site: SiteFindings | null): CollectorContext {
    const data: Partial<CollectorData> = { ...(stack ? { stack } : {}), ...(site ? { site } : {}) }
    return {
        input: { url: 'https://shop.com', domain: 'shop.com', personName: null, email: null, linkedinUrl: null },
        need: async id => (data[id] ?? null) as never,
    }
}

function json(body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } })
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('htmlToText', () => {
    it('keeps the line breaks and lists of a product description', () => {
        expect(htmlToText('<p>Coussin <strong>anti-chute</strong>&nbsp;pour b&eacute;b&eacute;</p><ul><li>Doux</li><li>L&#233;ger &amp; lavable</li></ul><script>track()</script>')).toBe(
            'Coussin anti-chute pour bébé\n\n- Doux\n- Léger & lavable'
        )
    })
})

describe('readShopifyProduct', () => {
    it('reads a product of /products.json, without its price', () => {
        expect(
            readShopifyProduct(
                {
                    title: ' Sac à dos anti-chute ',
                    handle: 'sac-a-dos-antichute-bebe-dragon-bleu',
                    body_html: '<p>Un coussin qui protège la tête de bébé.</p>',
                    product_type: 'Bébé',
                    tags: ['bebe', ' securite '],
                    images: [{ src: '//cdn.shopify.com/s/files/dragon.jpg' }],
                },
                'https://shop.com'
            )
        ).toEqual({
            name: 'Sac à dos anti-chute',
            url: 'https://shop.com/products/sac-a-dos-antichute-bebe-dragon-bleu',
            image: 'https://cdn.shopify.com/s/files/dragon.jpg',
            category: 'Bébé',
            tags: ['bebe', 'securite'],
            description: 'Un coussin qui protège la tête de bébé.',
        })
    })

    it('drops a product without a name or a handle', () => {
        expect(readShopifyProduct({ handle: 'x' }, 'https://shop.com')).toBeNull()
        expect(readShopifyProduct({ title: 'X' }, 'https://shop.com')).toBeNull()
    })
})

describe('readWooProduct', () => {
    it('reads a product of the Store API', () => {
        expect(
            readWooProduct(
                {
                    name: 'Tapis d&#8217;éveil',
                    permalink: 'https://shop.com/produit/tapis-eveil/',
                    description: '',
                    short_description: '<p>Un tapis.</p>',
                    categories: [{ name: 'Éveil' }],
                    tags: [{ name: 'bébé' }],
                    images: [{ src: 'https://shop.com/tapis.jpg' }],
                },
                'https://shop.com'
            )
        ).toEqual({ name: 'Tapis d’éveil', url: 'https://shop.com/produit/tapis-eveil/', image: 'https://shop.com/tapis.jpg', category: 'Éveil', tags: ['bébé'], description: 'Un tapis.' })
    })
})

describe('readProductPage', () => {
    const url = 'https://shop.com/products/sac-a-dos-antichute-bebe-dragon-bleu'

    it('reads the schema.org Product a shop publishes, without its price', () => {
        const ld = {
            '@context': 'https://schema.org/',
            '@graph': [
                { '@type': 'BreadcrumbList' },
                {
                    '@type': 'Product',
                    name: 'Sac à Dos Antichute Bébé Dragon Bleu&Rose',
                    description: 'Le coussin épais se place derrière la tête et amortit le choc.',
                    image: ['https://cdn.shop.com/dragon.webp', 'https://cdn.shop.com/dragon-2.jpg'],
                    category: 'general',
                    offers: { price: 19900 },
                },
            ],
        }
        const html = `<head><meta property="og:title" content="Autre — OriGiNe-CI"><script type="application/ld+json">{broken</script><script type="application/ld+json">${JSON.stringify(ld)}</script></head>`
        expect(readProductPage(html, url)).toEqual({
            name: 'Sac à Dos Antichute Bébé Dragon Bleu&Rose',
            url,
            image: 'https://cdn.shop.com/dragon.webp',
            category: null,
            tags: [],
            description: 'Le coussin épais se place derrière la tête et amortit le choc.',
        })
    })

    it('falls back on the sharing tags, without the shop name in the title', () => {
        const html =
            '<meta property="og:site_name" content="OriGiNe-CI"><meta property="og:title" content="Sac à Dos Dragon Bleu&amp;Rose — OriGiNe-CI"><meta property="og:description" content="Un coussin anti-chute."><meta property="og:image" content="/dragon.jpg">'
        expect(readProductPage(html, url)).toMatchObject({ name: 'Sac à Dos Dragon Bleu&Rose', image: 'https://shop.com/dragon.jpg', description: 'Un coussin anti-chute.' })
    })

    it('reads nothing from a page with no product on it', () => {
        expect(readProductPage('<p>Hello</p>', url)).toBeNull()
    })
})

describe('rankProducts', () => {
    it('puts what the shop features first, in its order, then keeps the platform order', () => {
        const products = ['a', 'b', 'c', 'd'].map(handle => product(`https://shop.com/products/${handle}`))
        const ranked = rankProducts(products, ['https://shop.com/collections/x/products/c', 'https://shop.com/products/a', 'https://shop.com/products/c'])
        expect(ranked.map(entry => entry.url)).toEqual(['https://shop.com/products/c', 'https://shop.com/products/a', 'https://shop.com/products/b', 'https://shop.com/products/d'])
    })

    it('keeps one product per name, the colour variants of a shirt included', () => {
        const ranked = rankProducts([product('https://shop.com/products/tee-green', 'Oversized Tee'), product('https://shop.com/products/tee-black', 'Oversized tee'), product('https://shop.com/products/tank', 'Tank')], [])
        expect(ranked.map(entry => entry.name)).toEqual(['Oversized Tee', 'Tank'])
    })
})

describe('catalogCollector', () => {
    it('skips a site that is not a shop', async () => {
        await expect(catalogCollector.run(context(stackWith([{ name: 'Webflow', category: 'CMS' }]), siteWith([])))).rejects.toBeInstanceOf(CollectorSkipped)
    })

    it('reads a Shopify catalogue for free and keeps the featured products first', async () => {
        const products = Array.from({ length: 40 }, (_, index) => ({ title: `Produit ${index}`, handle: `produit-${index}`, body_html: '<p>Description</p>' }))
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                if (url.includes('/products.json')) return json({ products: url.includes('page=1') ? products : [] })
                if (url.includes('/collections.json'))
                    return json({ collections: [{ title: 'Soldes', products_count: 0 }, { title: 'All products', products_count: 40 }, { title: 'Maison', products_count: 3 }, { title: 'Bébé', products_count: 12 }] })
                if (url.includes('sort_by=best-selling')) return new Response('<a href="/collections/all/products/produit-7">x</a>', { headers: { 'content-type': 'text/html' } })
                return new Response('', { status: 404 })
            })
        )

        const output = await catalogCollector.run(context(stackWith([{ name: 'Shopify', category: 'E-commerce' }]), siteWith([], ['https://shop.com/products/produit-30'])))

        expect(output.data.platform).toBe('Shopify')
        expect(output.data.total).toBe(40)
        expect(output.data.totalIsLowerBound).toBe(false)
        expect(output.data.collections).toEqual(['Bébé', 'Maison'])
        expect(output.data.products).toHaveLength(MAX_CATALOG_PRODUCTS)
        expect(output.data.products.slice(0, 3).map(entry => entry.name)).toEqual(['Produit 30', 'Produit 7', 'Produit 0'])
        expect(output.cost?.firecrawlCredits).toBe(0)
    })

    it('reads the total of a WooCommerce shop from its header', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                if (url.includes('/products/categories')) return json([{ name: 'Uncategorized' }, { name: 'Jouets' }])
                if (url.includes('/wc/store/v1/products')) return json([{ name: 'Hochet', permalink: 'https://shop.com/produit/hochet/' }], { 'x-wp-total': '5000' })
                return new Response('', { status: 404 })
            })
        )

        const output = await catalogCollector.run(context(stackWith([{ name: 'WooCommerce', category: 'E-commerce' }]), siteWith([])))

        expect(output.data).toMatchObject({ platform: 'WooCommerce', total: 5000, totalIsLowerBound: false, collections: ['Jouets'] })
        expect(output.data.products.map(entry => entry.name)).toEqual(['Hochet'])
    })
})
