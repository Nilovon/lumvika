-- A coworker's run on an issue that ended without the work (`issue.run_failed`, written by the hub
-- when the engine reports the end of the run).
--
-- 1. It is the coworker's own touch for the work queue: `issue_actor_touches` now hands it to the hub
--    with the other actions, so a failed run does not make its issue due again on the next heartbeat.
-- 2. One row per run: the engine may report the same end twice.
-- 3. `issue_run_failures` answers, per issue, the failure that is still its assignee's latest event,
--    for the banner of the issue and the marker of its card.

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
      and e.action in ('issue.created', 'issue.assigned', 'issue.status_changed', 'issue.commented', 'issue.updated', 'issue.checked_out', 'issue.run_failed')
    group by e.issue_id, e.actor_user_id, e.actor_agent_id, e.action
$$;

revoke all on function public.issue_actor_touches(bigint, uuid[]) from public, anon, authenticated;
grant execute on function public.issue_actor_touches(bigint, uuid[]) to service_role;

create unique index if not exists activity_events_run_failed_once
    on public.activity_events (workspace_id, (metadata ->> 'runId'))
    where action = 'issue.run_failed';

create or replace function public.issue_run_failures(p_workspace_id bigint, p_issue_ids uuid[])
returns table (issue_id uuid, actor_agent_id uuid, metadata jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
    select i.id, latest.actor_agent_id, latest.metadata, latest.created_at
    from public.issues i
    cross join lateral (
        select e.actor_agent_id, e.action, e.metadata, e.created_at
        from public.activity_events e
        where e.issue_id = i.id
          and e.workspace_id = i.workspace_id
          and e.actor_agent_id = i.assignee_agent_id
        order by e.created_at desc, e.id desc
        limit 1
    ) latest
    where i.workspace_id = p_workspace_id
      and i.id = any(p_issue_ids)
      and latest.action = 'issue.run_failed'
$$;

revoke all on function public.issue_run_failures(bigint, uuid[]) from public, anon, authenticated;
grant execute on function public.issue_run_failures(bigint, uuid[]) to service_role;
