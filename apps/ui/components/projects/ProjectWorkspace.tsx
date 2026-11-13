'use client'

import { BlockedReasonDialog } from '@/components/issues/BlockedReasonDialog'
import { IssueDetailDialog } from '@/components/issues/IssueDetailDialog'
import { NewIssueDialog } from '@/components/issues/NewIssueDialog'
import type { PageHeaderBack } from '@/components/layout/PageHeader'
import { PageFrame } from '@/components/layout/PageFrame'
import { ProjectBoard } from '@/components/projects/board/ProjectBoard'
import { ProjectIssueList } from '@/components/projects/list/ProjectIssueList'
import { ProjectOverview } from '@/components/projects/overview/ProjectOverview'
import { ProjectSkeleton } from '@/components/projects/ProjectSkeleton'
import { ProjectStatusBadge } from '@/components/projects/ProjectStatusBadge'
import { useProjectIssues } from '@/components/projects/useProjectIssues'
import { useProjectUrlState, type ProjectTab } from '@/components/projects/useProjectUrlState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArchiveIcon, LockIcon, PlusIcon } from '@/lib/icons'
import { formatIssueRef, type IssueStatus, type IssueSummary, type ProjectDetail } from '@lumvika/contracts'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

type ProjectWorkspaceProps = { project: ProjectDetail; back: PageHeaderBack; onProjectChanged: () => void }

export function ProjectWorkspace({ project, back, onProjectChanged }: ProjectWorkspaceProps) {
    const t = useTranslations('projects.detail')
    const url = useProjectUrlState()
    const issues = useProjectIssues(project.id, project.key)
    const [creating, setCreating] = useState(false)
    const [blocking, setBlocking] = useState<IssueSummary | null>(null)
    const archived = !!project.archivedAt
    const openIssue = (issue: IssueSummary) => url.openIssue(issue.number)

    // Blocked asks for its reason first, whichever surface asked for it.
    const changeStatus = (issue: IssueSummary, status: IssueStatus) => {
        if (status === 'blocked') setBlocking(issue)
        else void issues.transition(issue, status)
    }

    if (issues.issues === null) return <ProjectSkeleton back={back} />

    const tabs = (
        <Tabs value={url.tab} onValueChange={value => url.setTab(value as ProjectTab)}>
            <TabsList>
                <TabsTrigger value="board">{t('tabs.board')}</TabsTrigger>
                <TabsTrigger value="list">{t('tabs.list')}</TabsTrigger>
                <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
            </TabsList>
        </Tabs>
    )

    const title = (
        <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{project.name}</span>
            {project.visibility === 'restricted' && <LockIcon aria-label={t('restricted')} className="size-3.5 shrink-0 text-muted-foreground" />}
            <ProjectStatusBadge status={project.status} className="max-sm:hidden" />
        </span>
    )

    const notices = (archived || issues.loadError) && (
        <div className={url.tab === 'board' ? 'flex flex-col gap-2 px-4 pt-3 md:px-6' : 'flex flex-col gap-2 pb-3'}>
            {archived && (
                <Alert variant="warning">
                    <ArchiveIcon />
                    <AlertDescription>{t('archivedBanner')}</AlertDescription>
                </Alert>
            )}
            {issues.loadError && (
                <Alert variant="danger">
                    <AlertDescription>{issues.loadError}</AlertDescription>
                </Alert>
            )}
        </div>
    )

    const newIssueButton = !archived && (
        <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon />
            {t('newIssue')}
        </Button>
    )

    return (
        <PageFrame
            title={title}
            description={project.description ?? undefined}
            leading={<span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground max-sm:hidden">{project.key}</span>}
            back={back}
            actions={newIssueButton || undefined}
            tabs={tabs}
            bleed={url.tab === 'board'}
            bodyClassName={url.tab === 'overview' ? 'max-w-6xl' : url.tab === 'list' ? 'max-w-5xl' : undefined}
        >
            {url.tab === 'board' && (
                <div className="flex h-full min-h-0 flex-col">
                    {notices}
                    <div className="min-h-0 flex-1">
                        <ProjectBoard projectId={project.id} issues={issues.issues} totals={issues.totals} ops={issues} canAdd={!archived} onOpenIssue={openIssue} onStatusChange={changeStatus} />
                    </div>
                </div>
            )}
            {url.tab === 'list' && notices}
            {url.tab === 'list' && <ProjectIssueList issues={issues.issues} totals={issues.totals} onLoadMore={() => void issues.showMore()} loadingMore={issues.loadingMore} onOpenIssue={openIssue} onStatusChange={changeStatus} onCreate={archived ? undefined : () => setCreating(true)} />}
            {url.tab === 'overview' && <ProjectOverview project={project} onChanged={onProjectChanged} />}

            <NewIssueDialog projectId={project.id} projectName={project.name} projectRestricted={project.visibility === 'restricted'} open={creating} onOpenChange={setCreating} onCreate={issues.create} />
            <BlockedReasonDialog issueRef={blocking?.ref ?? ''} open={!!blocking} onOpenChange={open => !open && setBlocking(null)} onConfirm={reason => (blocking ? issues.transition(blocking, 'blocked', reason) : undefined)} />
            <IssueDetailDialog issueRef={url.issueNumber ? formatIssueRef(project.key, url.issueNumber) : null} onOpenChange={open => !open && url.closeIssue()} onIssueChange={issues.apply} onOpenIssue={openIssue} />
        </PageFrame>
    )
}
