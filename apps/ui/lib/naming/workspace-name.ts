// What the workspace is called when nobody has told us anything yet. Written by the just-in-time
// provisioning in app/api/_services/user-provisioning.service.ts, on the first page view of a visitor
// we know nothing about, and treated everywhere else as "still unnamed".
export const DEFAULT_WORKSPACE_NAME = 'My workspace'

// Long enough for a real company name, short enough that the pill does not have to truncate it.
export const WORKSPACE_NAME_MAX = 60

// A first name is typed into a field, so it arrives however the person types it. The workspace and
// the Box built from it are titles, read back on a pill and on a tile, so the initial is raised.
export function asTitle(firstName: string): string {
    const name = firstName.trim()
    return name ? name[0].toLocaleUpperCase() + name.slice(1) : name
}

// The one place the apostrophe lives, so the pill, the settings dialog and the lifecycle emails
// cannot disagree on what a name ending in s looks like.
export function possessive(firstName: string): string {
    const name = firstName.trim()
    return /s$/i.test(name) ? `${name}'` : `${name}'s`
}

function cap(name: string): string {
    return name.length > WORKSPACE_NAME_MAX ? name.slice(0, WORKSPACE_NAME_MAX).trimEnd() : name
}

// A workspace is a company object, so the company read off the website wins. The first name behind
// it is not a lesser guess but a different one: it is the right answer for someone who has no site
// to give. The default is only ever reached by a visitor who never answered the survey.
export function workspaceNameFrom(input: { companyName?: string | null; firstName?: string | null }): string {
    const company = input.companyName?.trim()
    if (company) return cap(company)

    const first = asTitle(input.firstName ?? '')
    if (first) return cap(`${possessive(first)} workspace`)

    return DEFAULT_WORKSPACE_NAME
}
