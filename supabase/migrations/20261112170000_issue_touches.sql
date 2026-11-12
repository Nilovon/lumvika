-- When each open issue was last touched by the coworker it is assigned to, by anyone else, and by a
-- person's comment, read exactly per issue for the work queue (`work-queue.service.ts`). The queue
-- used to read the newest events of the whole workspace in one window and took an issue with none in
-- it for never touched, which handed old issues out again in a busy workspace. Activity rows go with
-- their issue and its project (on delete cascade), so nothing here can outlive what it describes.
create or replace function public.issue_touches(p_workspace_id bigint, p_issue_ids uuid[])
returns table (issue_id uuid, assignee_touched_at timestamptz, others_touched_at timestamptz, person_commented_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
    select
        i.id,
        (
            select max(e.created_at)
            from public.activity_events e
            where e.issue_id = i.id
              and e.workspace_id = i.workspace_id
              and e.actor_agent_id = i.assignee_agent_id
              and e.action in ('issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out')
        ),
        (
            select max(e.created_at)
            from public.activity_events e
            where e.issue_id = i.id
              and e.workspace_id = i.workspace_id
              and e.actor_agent_id is distinct from i.assignee_agent_id
              and e.action in ('issue.created', 'issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out')
        ),
        (
            select max(e.created_at)
            from public.activity_events e
            where e.issue_id = i.id
              and e.workspace_id = i.workspace_id
              and e.action = 'issue.commented'
              and e.actor_user_id is not null
        )
    from public.issues i
    where i.workspace_id = p_workspace_id
      and i.id = any(p_issue_ids)
$$;

revoke all on function public.issue_touches(bigint, uuid[]) from public, anon, authenticated;
grant execute on function public.issue_touches(bigint, uuid[]) to service_role;
