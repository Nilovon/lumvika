import { firecrawl } from '../firecrawl'
import { domainLabel } from './social'
import type { Collector } from './types'

export type SearchResult = { url: string; title: string; description: string }
export type SearchQueryKind = 'person' | 'press' | 'alternatives'
export type SearchFindings = { queries: { kind: SearchQueryKind; query: string; results: SearchResult[]; error?: string }[] }

type SearchResponse = { data?: { web?: { url: string; title?: string; description?: string }[] }; creditsUsed?: number }

export const searchCollector: Collector<'search'> = {
    id: 'search',
    needs: [],
    async run({ input }) {
        const label = domainLabel(input.domain)
        const planned: { kind: SearchQueryKind; query: string; limit: number }[] = [
            ...(input.personName ? [{ kind: 'person' as const, query: `"${input.personName}" ${label} site:linkedin.com/in`, limit: 5 }] : []),
            { kind: 'press', query: `"${input.domain}" -site:${input.domain}`, limit: 8 },
            { kind: 'alternatives', query: `${label} alternatives competitors`, limit: 6 },
        ]

        let credits = 0
        const queries = await Promise.all(
            planned.map(async ({ kind, query, limit }) => {
                try {
                    const body = await firecrawl<SearchResponse>('/v2/search', { query, limit }, 30_000)
                    credits += body.creditsUsed ?? 2
                    const results = (body.data?.web ?? []).map(result => ({ url: result.url, title: result.title ?? '', description: result.description ?? '' }))
                    return { kind, query, results }
                } catch (error) {
                    return { kind, query, results: [], error: error instanceof Error ? error.message : String(error) }
                }
            })
        )
        if (queries.every(query => query.error)) throw new Error(queries[0].error)

        return {
            data: { queries },
            cost: { firecrawlCredits: credits },
            highlights: queries.map(query => `${query.kind} : ${query.error ? `erreur (${query.error})` : `${query.results.length} résultats`}`),
        }
    },
}
