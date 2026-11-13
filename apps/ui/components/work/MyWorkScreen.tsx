'use client'

import { BlockedReasonDialog } from '@/components/issues/BlockedReasonDialog'
import { IssueDetailDialog } from '@/components/issues/IssueDetailDialog'
import { PageFrame } from '@/components/layout/PageFrame'
import { NAV_ICONS } from '@/components/layout/sidebar/nav-icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MY_WORK_TABS, MyWorkTabs, type MyWorkTab } from '@/components/work/MyWorkTabs'
import { MyWorkSkeleton } from '@/components/work/MyWorkSkeleton'
import { useMyWork } from '@/components/work/useMyWork'
import { useTabParam } from '@/components/work/useTabParam'
import { sectionsOfGroups, WorkIssueList, type WorkIssueSection } from '@/components/work/WorkIssueList'
import { KanbanIcon } from '@/lib/icons'
import { groupByWorkingOrder } from '@/lib/work/my-work'
import { isIssueClosed, type IssueStatus, type IssueSummary } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export function MyWorkScreen() {
    const t = useTranslations('work')
    const tStatus = useTranslations('issues.status')
    const [tab, setTab] = useTabParam(MY_WORK_TABS)
    const { work, loadError, reload, changeStatus, apply } = useMyWork()
    const [openRef, setOpenRef] = useState<string | null>(null)
    const [blocking, setBlocking] = useState<IssueSummary | null>(null)

    const projects = useMemo(() => new Map((work?.projects ?? []).map(project => [project.id, project])), [work])
    const counts = useMemo<Record<MyWorkTab, number> | null>(() => (work ? { assigned: work.assigned.length, created: work.created.filter(issue => !isIssueClosed(issue.status)).length, coworkers: work.delegated.length } : null), [work])

    const sections = useMemo<WorkIssueSection[]>(() => {
        if (!work) return []
        const statusLabel = (status: IssueStatus) => tStatus(status)
        if (tab === 'assigned') return sectionsOfGroups(groupByWorkingOrder(work.assigned), statusLabel)
        if (tab === 'coworkers') return sectionsOfGroups(groupByWorkingOrder(work.delegated), statusLabel)
        const open = work.created.filter(issue => !isIssueClosed(issue.status))
        const closed = work.created.filter(issue => isIssueClosed(issue.status))
        return [...sectionsOfGroups(groupByWorkingOrder(open), statusLabel), ...(closed.length ? [{ id: 'closed', title: t('closed'), issues: closed }] : [])]
    }, [work, tab, t, tStatus])

    const onStatusChange = (issue: IssueSummary, status: IssueStatus) => {
        if (status === 'blocked') setBlocking(issue)
        else void changeStatus(issue, status)
    }

    const workingNow = tab === 'coworkers' ? (work?.delegated.filter(issue => !!issue.checkoutRunId).length ?? 0) : 0
    const projectsLink = (
        <Button asChild size="sm" variant="outline">
            <Link href="/projects">
                <KanbanIcon />
                {t('goToProjects')}
            </Link>
        </Button>
    )

    return (
        <PageFrame title={t('title')} description={t('description')} tabs={<MyWorkTabs value={tab} onChange={setTab} counts={counts} />} bodyClassName="max-w-5xl">
            {work === null ? (
                <MyWorkSkeleton />
            ) : loadError && sections.length === 0 ? (
                <EmptyState
                    icon={NAV_ICONS.work}
                    title={t('loadFailed')}
                    description={loadError}
                    action={
                        <Button size="sm" variant="outline" onClick={() => void reload()}>
                            {t('retry')}
                        </Button>
                    }
                    className="py-16"
                />
            ) : sections.length === 0 ? (
                <EmptyState icon={NAV_ICONS.work} title={t(`empty.${tab}.title`)} description={t(`empty.${tab}.description`)} action={projectsLink} className="py-16" />
            ) : (
                <div className="flex flex-col gap-3">
                    {workingNow > 0 && <p className="px-1 text-xs text-muted-foreground">{t('workingCount', { count: workingNow })}</p>}
                    <WorkIssueList sections={sections} projects={projects} onOpen={issue => setOpenRef(issue.ref)} onStatusChange={onStatusChange} />
                </div>
            )}
            <IssueDetailDialog issueRef={openRef} onOpenChange={open => !open && setOpenRef(null)} onIssueChange={apply} />
            {blocking && <BlockedReasonDialog issueRef={blocking.ref} open onOpenChange={open => !open && setBlocking(null)} onConfirm={reason => changeStatus(blocking, 'blocked', reason)} />}
        </PageFrame>
    )
}
