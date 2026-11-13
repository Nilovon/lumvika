-- When each actor last acted on each open issue, per kind of action, for the work queue
-- (`work-queue.service.ts`). `issue_touches` (20261112170000) folded every person into "someone
-- else", so a person who may not use a coworker still made its issue due on the next heartbeat and
-- steered it, minutes after the wake that refused them. The hub now decides per actor, with the same
-- rule as a wake: this function hands it the last time of each actor and action, exact per issue.
-- Activity rows go with their issue and its project (on delete cascade), so nothing outlives what it
-- describes. `issue_touches` is left in place for an older hub still running beside this one.
create or replace function public.issue_actor_touches(p_workspace_id bigint, p_issue_ids uuid[])
returns table (issue_id uuid, actor_user_id uuid, actor_agent_id uuid, action text, last_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
    select e.issue_id, e.actor_user_id, e.actor_agent_id, e.action, max(e.created_at)
    from public.activity_events e
    join public.issues i on i.id = e.issue_id and i.workspace_id = e.workspace_id
    where i.workspace_id = p_workspace_id
      and i.id = any(p_issue_ids)
      and e.action in ('issue.created', 'issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out')
    group by e.issue_id, e.actor_user_id, e.actor_agent_id, e.action
$$;

revoke all on function public.issue_actor_touches(bigint, uuid[]) from public, anon, authenticated;
grant execute on function public.issue_actor_touches(bigint, uuid[]) to service_role;
