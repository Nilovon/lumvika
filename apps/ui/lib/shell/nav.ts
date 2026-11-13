export const NAV_ITEM_IDS = ['overview', 'office', 'chat', 'work', 'projects', 'goals', 'review', 'channels', 'teams', 'activity'] as const

export type NavItemId = (typeof NAV_ITEM_IDS)[number]

export type NavGroupId = 'main' | 'work' | 'collaborate' | 'activity'

export type NavHeadingId = 'work' | 'collaborate'

export type NavItem = { id: NavItemId; href: string }

// A group without a heading is only a gap in the list.
export type NavGroup = { id: NavGroupId; heading: NavHeadingId | null; items: readonly NavItem[] }

export const NAV_HREFS: Record<NavItemId, string> = {
    overview: '/overview',
    office: '/',
    chat: '/chat',
    work: '/work',
    projects: '/projects',
    goals: '/goals',
    review: '/review',
    channels: '/channels',
    teams: '/teams',
    activity: '/activity',
}

const item = (id: NavItemId): NavItem => ({ id, href: NAV_HREFS[id] })

export const NAV_GROUPS: readonly NavGroup[] = [
    { id: 'main', heading: null, items: [item('overview'), item('office'), item('chat')] },
    { id: 'work', heading: 'work', items: [item('work'), item('projects'), item('goals'), item('review')] },
    { id: 'collaborate', heading: 'collaborate', items: [item('channels'), item('teams')] },
    { id: 'activity', heading: null, items: [item('activity')] },
]

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(group => group.items)

// The board owns `/` alone: every other area also owns what lies under it (`/projects/LUM`).
export function isNavHrefActive(pathname: string, href: string): boolean {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
}

export function activeNavItemId(pathname: string): NavItemId | null {
    return NAV_ITEMS.find(entry => isNavHrefActive(pathname, entry.href))?.id ?? null
}
