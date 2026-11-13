'use client'

import { useSearchParams } from 'next/navigation'

export const PROJECT_TABS = ['board', 'list', 'overview'] as const
export type ProjectTab = (typeof PROJECT_TABS)[number]

function writeParams(change: (params: URLSearchParams) => void, mode: 'push' | 'replace') {
    const params = new URLSearchParams(window.location.search)
    change(params)
    const query = params.toString()
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`
    // Next keeps useSearchParams in step with the history API, without a round trip to the server.
    if (mode === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
}

// The tab (`?tab=list`) and the open issue (`?issue=12`) of a project page live in its address, so
// a link opens the same view and Back closes an issue.
export function useProjectUrlState() {
    const searchParams = useSearchParams()
    const rawTab = searchParams.get('tab')
    const tab: ProjectTab = (PROJECT_TABS as readonly string[]).includes(rawTab ?? '') ? (rawTab as ProjectTab) : 'board'
    const rawIssue = Number(searchParams.get('issue'))
    const issueNumber = Number.isInteger(rawIssue) && rawIssue > 0 ? rawIssue : null

    return {
        tab,
        issueNumber,
        setTab: (next: ProjectTab) => writeParams(params => (next === 'board' ? params.delete('tab') : params.set('tab', next)), 'replace'),
        openIssue: (number: number) => writeParams(params => params.set('issue', String(number)), issueNumber === null ? 'push' : 'replace'),
        closeIssue: () => writeParams(params => params.delete('issue'), 'replace'),
    }
}
