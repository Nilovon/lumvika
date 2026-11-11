import { selectMany, type DbScope } from '@/lib/db'
import type { LibraryCreator } from './library'

const CREATOR_COLUMNS = ['id', 'slug', 'name', 'type', 'avatar_url', 'banner_url', 'location', 'bio', 'x_url', 'linkedin_url', 'github_url', 'website_url', 'accepted_at', 'featured'] as const

type CreatorRow = {
    id: string
    slug: string
    name: string
    type: string
    avatar_url: string | null
    banner_url: string
    location: string | null
    bio: string | null
    x_url: string | null
    linkedin_url: string | null
    github_url: string | null
    website_url: string | null
    accepted_at: string | null
}

// `accepted_at` is only written when the expert publishes the fiche from their own account. A
// template author is verified whatever the fiche says: signing a template takes an account.
function toLibraryCreator(row: CreatorRow, { authorsTemplates }: { authorsTemplates: boolean }): LibraryCreator {
    return {
        slug: row.slug,
        name: row.name,
        kind: row.type as LibraryCreator['kind'],
        avatarUrl: row.avatar_url,
        bannerUrl: row.banner_url || null,
        location: row.location,
        bio: row.bio,
        links: { x: row.x_url, linkedin: row.linkedin_url, github: row.github_url, website: row.website_url },
        verified: authorsTemplates || row.accepted_at !== null,
    }
}

// The byline of every listed template in two reads rather than two per card. An account points at
// its fiche rather than the other way around, hence the hop through `users`. A fiche still in draft
// does not sign, the same rule the public template page follows.
export async function loadLibraryCreators(scope: DbScope, creatorIds: string[]): Promise<Map<string, LibraryCreator>> {
    const creators = new Map<string, LibraryCreator>()
    const ids = [...new Set(creatorIds)]
    if (ids.length === 0) return creators

    const { data: accounts } = await selectMany(scope, 'users', ['id', 'expert_profile_id'] as const, { id: ids })
    const profileByAccount = new Map((accounts ?? []).filter(account => account.expert_profile_id).map(account => [account.id, account.expert_profile_id as string]))
    if (profileByAccount.size === 0) return creators

    const { data: experts } = await selectMany(scope, 'experts', CREATOR_COLUMNS, { id: [...new Set(profileByAccount.values())], status: 'published' })
    const expertById = new Map((experts ?? []).map(expert => [expert.id, toLibraryCreator(expert, { authorsTemplates: true })]))

    for (const [accountId, profileId] of profileByAccount) {
        const creator = expertById.get(profileId)
        if (creator) creators.set(accountId, creator)
    }
    return creators
}

const DIRECTORY_SIZE = 12

// The people the library introduces beyond the bylines: published fiches with a face, the ones the
// community page features first. Template authors are merged in on the client, where the counts are.
export async function loadCreatorDirectory(scope: DbScope): Promise<LibraryCreator[]> {
    const { data } = await selectMany(scope, 'experts', CREATOR_COLUMNS, { status: 'published', avatar_url: { notNull: true } }, { column: 'featured', ascending: false }, DIRECTORY_SIZE)
    return (data ?? []).map(row => toLibraryCreator(row, { authorsTemplates: false }))
}
