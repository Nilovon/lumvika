'use server'

import { after } from 'next/server'
import { listExpertBannerUrls, uploadExpertImage, type ExpertImageFolder } from '@lumvika/storage'
import { captureServer, deterministicUuid } from '@lumvika/analytics/server'
import { expertDistinctId } from '@lumvika/analytics'
import { editExpertSchema, type EditExpertValues } from '@lumvika/ui/experts/schema'
import { badgeFromType, type ExpertStatus } from '@lumvika/ui/experts/options'
import { initialsFromName, type OwnerExpert } from '@lumvika/ui/experts/types'

import { AuthorizationError } from '@/app/api/_auth/ownership'
import { revalidateLanding } from '@/lib/landing-revalidate'
import { getServerSession } from '@/lib/auth/session/getServerSession'
import { selectMaybeSingle, serviceScope, updateRows } from '@/lib/db'
import { failure, failureOf, type ActionFailure } from '@/lib/i18n/action-error'

// Self-serve edition of the caller's own marketplace fiche, the in-app twin of the landing claim
// link. The capability is the account: `users.expert_profile_id` is the only way in, and the fiche
// id is resolved here rather than accepted from the client. Reads go through the service scope
// because the RLS policy on `experts` only exposes published rows, and `email` is not
// granted to `authenticated` at all.

const OWNER_EXPERT_COLUMNS = [
    'id',
    'slug',
    'name',
    'type',
    'location',
    'bio',
    'budget',
    'availability',
    'avatar_url',
    'banner_url',
    'skills',
    'languages',
    'x_url',
    'linkedin_url',
    'github_url',
    'website_url',
    'featured',
    'seo_indexed',
    'email',
    'status',
] as const

export type ExpertProfileResult = { ok: true; expert: OwnerExpert; bannerOptions: string[] } | ActionFailure
export type UpdateExpertProfileResult = { ok: true; slug: string } | ActionFailure
export type UploadExpertProfileResult = { ok: true; url: string } | ActionFailure

const nullIfEmpty = (value: string) => (value.trim() ? value.trim() : null)

async function requireOwnExpertId(): Promise<string> {
    const { user } = await getServerSession()
    if (!user?.id) throw new AuthorizationError('notAuthenticated')

    const scope = serviceScope()
    const { data: account } = await selectMaybeSingle(scope, 'users', ['expert_profile_id'] as const, { id: user.id })
    if (!account?.expert_profile_id) throw new AuthorizationError('noExpertProfile')

    return account.expert_profile_id
}

export async function getMyExpertProfileAction(): Promise<ExpertProfileResult> {
    try {
        const expertId = await requireOwnExpertId()
        const scope = serviceScope()

        const { data } = await selectMaybeSingle(scope, 'experts', OWNER_EXPERT_COLUMNS, { id: expertId })
        if (!data) return failure('expertProfileNotFound')

        const bannerOptions = await listExpertBannerUrls()

        return {
            ok: true,
            bannerOptions,
            expert: {
                id: data.id,
                slug: data.slug,
                name: data.name,
                type: data.type,
                badge: badgeFromType(data.type),
                location: data.location,
                bio: data.bio,
                budget: data.budget,
                availability: data.availability,
                avatarUrl: data.avatar_url,
                bannerUrl: data.banner_url,
                initials: initialsFromName(data.name),
                skills: data.skills ?? [],
                languages: data.languages ?? [],
                xUrl: data.x_url,
                linkedinUrl: data.linkedin_url,
                githubUrl: data.github_url,
                websiteUrl: data.website_url,
                featured: data.featured,
                seoIndexed: data.seo_indexed,
                email: data.email,
                status: data.status as ExpertStatus,
            },
        }
    } catch (err) {
        return failureOf(err, 'loadPublicProfileFailed')
    }
}

export async function updateMyExpertProfileAction(values: EditExpertValues): Promise<UpdateExpertProfileResult> {
    try {
        const expertId = await requireOwnExpertId()
        const parsed = editExpertSchema.parse(values)
        const scope = serviceScope()

        const { data: existing } = await selectMaybeSingle(scope, 'experts', ['id', 'slug', 'email', 'banner_url'] as const, { id: expertId })
        if (!existing) return failure('expertProfileNotFound')

        const now = new Date().toISOString()
        const { error } = await updateRows(
            scope,
            'experts',
            {
                name: parsed.name.trim(),
                type: parsed.type,
                email: nullIfEmpty(parsed.email),
                location: nullIfEmpty(parsed.location),
                bio: nullIfEmpty(parsed.bio),
                availability: parsed.availability,
                budget: nullIfEmpty(parsed.budget),
                avatar_url: nullIfEmpty(parsed.avatar_url),
                banner_url: parsed.banner_url.trim() || existing.banner_url,
                skills: parsed.skills,
                languages: parsed.languages,
                x_url: nullIfEmpty(parsed.x_url),
                linkedin_url: nullIfEmpty(parsed.linkedin_url),
                github_url: nullIfEmpty(parsed.github_url),
                website_url: nullIfEmpty(parsed.website_url),
                status: 'published',
                accepted_at: now,
                updated_at: now,
            },
            { id: expertId },
        )

        if (error) throw new Error(error.message)

        // Deduped on the fiche, not on the save: what the funnel measures is the listing going
        // live once, and every later edit republishes the same row.
        after(() =>
            captureServer(
                expertDistinctId(existing),
                'expert_profile_published',
                { expert_id: existing.id, expert_slug: existing.slug },
                { uuid: deterministicUuid(`expert_profile_published:${existing.id}`) },
            ),
        )

        await revalidateLanding(['/community/experts', `/community/experts/${existing.slug}`])
        return { ok: true, slug: existing.slug }
    } catch (err) {
        return failureOf(err, 'savePublicProfileFailed')
    }
}

async function uploadOwnExpertImage(formData: FormData, folder: ExpertImageFolder): Promise<UploadExpertProfileResult> {
    const expertId = await requireOwnExpertId()
    return uploadExpertImage({ expertId, file: formData.get('file'), folder, prefix: 'claimed' })
}

export async function uploadMyExpertAvatarAction(formData: FormData): Promise<UploadExpertProfileResult> {
    try {
        return await uploadOwnExpertImage(formData, 'photo')
    } catch (err) {
        return failureOf(err, 'uploadPhotoFailedShort')
    }
}

export async function uploadMyExpertBannerAction(formData: FormData): Promise<UploadExpertProfileResult> {
    try {
        return await uploadOwnExpertImage(formData, 'banner')
    } catch (err) {
        return failureOf(err, 'uploadBannerFailed')
    }
}
