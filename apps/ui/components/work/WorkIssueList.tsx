'use client'

import { IssueRow } from '@/components/issues/IssueRow'
import { IssueStatusPicker } from '@/components/issues/IssueStatusPicker'
import { ProjectChip } from '@/components/work/ProjectChip'
import type { WorkProjectRef } from '@/lib/work/review-queue'
import type { IssueGroup } from '@/lib/work/my-work'
import type { IssueStatus, IssueSummary } from '@lumvika/contracts'
import { Badge } from '@lumvika/ui/primitives'
import { useTranslations } from 'next-intl'

export type WorkIssueSection = { id: string; title: string; issues: IssueSummary[] }

export function sectionsOfGroups(groups: IssueGroup[], statusLabel: (status: IssueStatus) => string): WorkIssueSection[] {
    return groups.map(group => ({ id: group.status, title: statusLabel(group.status), issues: group.issues }))
}

type WorkIssueListProps = {
    sections: WorkIssueSection[]
    projects: ReadonlyMap<string, WorkProjectRef>
    onOpen: (issue: IssueSummary) => void
    onStatusChange: (issue: IssueSummary, status: IssueStatus) => void
}

// Issues of several projects in titled sections, each row naming its project and letting its status
// change in place.
export function WorkIssueList({ sections, projects, onOpen, onStatusChange }: WorkIssueListProps) {
    const t = useTranslations('work')

    return (
        <div className="flex flex-col gap-5">
            {sections.map(section => (
                <section key={section.id} aria-labelledby={`work-section-${section.id}`} className="flex flex-col gap-2">
                    <h2 id={`work-section-${section.id}`} className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                        {section.title}
                        <span className="tabular-nums">{section.issues.length}</span>
                    </h2>
                    <div className="overflow-hidden rounded-lg border border-border">
                        {section.issues.map(issue => {
                            const project = projects.get(issue.projectId)
                            const working = !!issue.checkoutRunId && issue.assignee?.kind === 'agent'
                            return (
                                <IssueRow
                                    key={issue.id}
                                    issue={issue}
                                    onOpen={onOpen}
                                    leading={
                                        <>
                                            {project && <ProjectChip name={project.name} projectKey={project.key} />}
                                            {working && (
                                                <Badge size="xs" tone="green" glow={false} className="shrink-0 font-medium">
                                                    {t('workingNow')}
                                                </Badge>
                                            )}
                                        </>
                                    }
                                    status={<IssueStatusPicker status={issue.status} onChange={next => onStatusChange(issue, next)} />}
                                />
                            )
                        })}
                    </div>
                </section>
            ))}
        </div>
    )
}
