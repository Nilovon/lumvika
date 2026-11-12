'use client'

import { IssueDetailDialog } from '@/components/issues/IssueDetailDialog'
import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { ReviewCommentDialog, type ReviewCommentMode } from '@/components/review/ReviewCommentDialog'
import { ReviewItemCard } from '@/components/review/ReviewItemCard'
import { ReviewSkeleton } from '@/components/review/ReviewSkeleton'
import { REVIEW_TABS, ReviewTabs, type ReviewTab } from '@/components/review/ReviewTabs'
import { useReviewQueue } from '@/components/review/useReviewQueue'
import { useWaitingConversations } from '@/components/review/useWaitingConversations'
import { WaitingConversations } from '@/components/review/WaitingConversations'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useTabParam } from '@/components/work/useTabParam'
import { CircleCheckIcon, TriangleAlertIcon } from '@/lib/icons'
import type { ReviewItem } from '@/lib/work/review-queue'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export function ReviewScreen() {
    const t = useTranslations('review')
    const [tab, setTab] = useTabParam(REVIEW_TABS)
    const { queue, loadError, reload, approve, requestChanges, unblock } = useReviewQueue()
    const conversations = useWaitingConversations()
    const [openRef, setOpenRef] = useState<string | null>(null)
    const [commenting, setCommenting] = useState<{ mode: ReviewCommentMode; item: ReviewItem } | null>(null)

    const counts: Partial<Record<ReviewTab, number>> = { toReview: queue?.toReview.length, blocked: queue?.blocked.length, conversations: conversations?.length }
    const loaded = queue !== null && conversations !== null
    const allClear = loaded && !loadError && queue.toReview.length + queue.blocked.length + conversations.length === 0

    const confirmComment = (comment: string) => {
        if (!commenting) return Promise.resolve(false)
        const issueId = commenting.item.issue.id
        return commenting.mode === 'requestChanges' ? requestChanges(issueId, comment) : unblock(issueId, comment)
    }

    const items = tab === 'blocked' ? queue?.blocked : queue?.toReview
    const emptyIcon = tab === 'blocked' ? TriangleAlertIcon : CircleCheckIcon

    return (
        <PageFrame title={t('title')} description={t('description')} tabs={<ReviewTabs value={tab} onChange={setTab} counts={counts} />} bodyClassName="max-w-4xl">
            {allClear ? (
                <EmptyState icon={CircleCheckIcon} title={t('allClear.title')} description={t('allClear.description')} className="py-16" />
            ) : tab === 'conversations' ? (
                conversations === null ? <ReviewSkeleton /> : <WaitingConversations sessions={conversations} />
            ) : queue === null ? (
                <ReviewSkeleton />
            ) : loadError ? (
                <EmptyState
                    icon={NAV_ICONS.review}
                    title={t('loadFailed')}
                    description={loadError}
                    action={
                        <Button size="sm" variant="outline" onClick={() => void reload()}>
                            {t('retry')}
                        </Button>
                    }
                    className="py-16"
                />
            ) : !items || items.length === 0 ? (
                <EmptyState icon={emptyIcon} title={t(`empty.${tab}.title`)} description={t(`empty.${tab}.description`)} className="rounded-lg border border-dashed border-border py-12" />
            ) : (
                <div className="flex flex-col gap-3">
                    {items.map(item => (
                        <ReviewItemCard
                            key={item.issue.id}
                            item={item}
                            onOpen={open => setOpenRef(open.issue.ref)}
                            onApprove={approved => void approve(approved.issue.id)}
                            onRequestChanges={sent => setCommenting({ mode: 'requestChanges', item: sent })}
                            onUnblock={freed => setCommenting({ mode: 'unblock', item: freed })}
                        />
                    ))}
                </div>
            )}
            <IssueDetailDialog
                issueRef={openRef}
                onOpenChange={open => {
                    if (open) return
                    setOpenRef(null)
                    void reload()
                }}
            />
            <ReviewCommentDialog mode={commenting?.mode ?? 'requestChanges'} issueRef={commenting?.item.issue.ref ?? null} onOpenChange={open => !open && setCommenting(null)} onConfirm={confirmComment} />
        </PageFrame>
    )
}
