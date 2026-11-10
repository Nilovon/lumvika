-- A sandbox nobody opens for 30 days is archived like a workspace whose plan ended, and comes back
-- only once an admin approves it. Everything about that episode lives on its archive row: why the
-- archive was taken, whether its owner asked for the sandbox back, and what we answered. The row
-- outlives the 90-day purge, so the refusal to hand out a fresh machine does too.

create type public.workspace_archive_reason as enum ('access_ended', 'inactivity', 'manual');

alter table public.workspace_archives
    add column reason public.workspace_archive_reason not null default 'access_ended',
    add column reactivation_requested_at timestamptz,
    add column reactivation_request_note text,
    add column reactivation_approved_at timestamptz,
    add column reactivation_rejected_at timestamptz,
    add column reactivation_reviewed_by uuid references public.users (id) on delete set null;

create index workspace_archives_reactivation_pending_idx
    on public.workspace_archives (reactivation_requested_at)
    where reactivation_requested_at is not null and reactivation_approved_at is null and reactivation_rejected_at is null;

-- The last sign of a human in the workspace: the app open in a visible tab, or a call made with one
-- of its API keys. A schedule firing on its own is not one. Only ever stamped for a sandbox.
alter table public.workspaces
    add column last_active_at timestamptz;

update public.workspaces w
set last_active_at = greatest(
    w.created_at,
    coalesce((select max(k.last_used_at) from public.api_keys k where k.workspace_id = w.id), w.created_at),
    coalesce(
        (
            select max(s.updated_at)
            from public.sessions s
            join public.agents a on a.id = s.agent_id
            where a.workspace_id = w.id and s.source in ('dashboard', 'builder', 'api')
        ),
        w.created_at
    )
)
where w.is_sandbox;

-- Called from the presence heartbeat, twice a minute per open tab: one statement, and at most one
-- write an hour per sandbox.
create or replace function public.touch_sandbox_activity(p_user_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
    update public.workspaces w
    set last_active_at = now()
    from public.users u
    where u.id = p_user_id
      and w.id = u.workspace_id
      and w.is_sandbox
      and (w.last_active_at is null or w.last_active_at < now() - interval '1 hour');
$$;

revoke execute on function public.touch_sandbox_activity(uuid) from public, anon, authenticated;
