-- A notification row had no recipient: every tab of every member of the workspace received it and
-- decided alone, from its own prefs, whether to ring. In a team that meant the sound everywhere. The
-- hub now decides who a notification reaches when it stores it, and why.

-- Who wrote in a conversation. A session belongs to an agent, never to a member, so this is the only
-- record of who is in it: the run's author reaches them, and so does a question asked in it later.
create table public.session_participants (
    session_id uuid not null references public.sessions(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    last_message_at timestamptz not null default now(),
    primary key (session_id, user_id)
);

create index session_participants_user_idx on public.session_participants (user_id);

alter table public.session_participants enable row level security;

create policy "Members read the participants of their workspace sessions"
on public.session_participants
as permissive
for select
to authenticated
using ((session_id in (select s.id from public.sessions s join public.agents a on a.id = s.agent_id where a.workspace_id in (select public.current_workspace_ids() as current_workspace_ids))));

-- `{ "<user id>": "<reason>" }`, the reason being what the inbox shows under the row (mine,
-- participant, followed, all_activity, everything, workspace). Null on the rows stored before this
-- migration: those stay visible to every member, as they were.
alter table public.notifications add column recipients jsonb;

-- One email when a source breaks while the recipient is away, one more when it works again, and
-- nothing in between however often it keeps failing. An open incident is a row whose `resolved_at`
-- is null; a source that breaks again reopens the same row.
create table public.notification_incidents (
    user_id uuid not null references public.users(id) on delete cascade,
    source_key text not null,
    opened_at timestamptz not null default now(),
    resolved_at timestamptz,
    primary key (user_id, source_key)
);

create index notification_incidents_open_source_idx on public.notification_incidents (source_key) where resolved_at is null;

alter table public.notification_incidents enable row level security;
revoke all on table public.notification_incidents from anon, authenticated;

-- True only for the call that opened (or reopened) the incident: two webhooks racing on the same
-- failure send one email, not two.
create or replace function public.open_notification_incident(p_user_id uuid, p_source_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
    with opened as (
        insert into public.notification_incidents (user_id, source_key)
        values (p_user_id, p_source_key)
        on conflict (user_id, source_key) do update
            set opened_at = now(), resolved_at = null
            where notification_incidents.resolved_at is not null
        returning 1
    )
    select exists (select 1 from opened);
$$;

-- Closes every open incident on a source and returns who was told it broke, so each of them is told
-- it works again.
create or replace function public.resolve_notification_incidents(p_source_key text)
returns setof uuid
language sql
security definer
set search_path = public
as $$
    update public.notification_incidents
    set resolved_at = now()
    where source_key = p_source_key and resolved_at is null
    returning user_id;
$$;

revoke all on function public.open_notification_incident(uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_notification_incidents(text) from public, anon, authenticated;
grant execute on function public.open_notification_incident(uuid, text) to service_role;
grant execute on function public.resolve_notification_incidents(text) to service_role;
